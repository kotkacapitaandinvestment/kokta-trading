// The public status page: live checks of each part of Kotka, and a history
// built only from real samples the scheduled jobs recorded. A part that isn't
// set up says so; nothing is ever shown as working without a check behind it.

import { prisma } from '../prisma.js';
import { effectiveModels } from '../aiModels.js';
import { loadSettings as loadResearchSettings } from '../research/settings.js';
import { loadGameSettings } from '../game/config.js';

export const COMPONENTS = [
  { key: 'app', name: 'Website and app', about: 'Pages load and the app answers.' },
  { key: 'data', name: 'Accounts and data', about: 'Signing in, and saving and loading your journal, checklist, goals and Community.' },
  { key: 'ai', name: 'Kotka AI', about: 'Chat, chart reading and research summaries.' },
  { key: 'research', name: 'Market data and research', about: 'Prices, the economic calendar and Fundamental Research reports.' },
  { key: 'payments', name: 'Trading Game payments', about: 'Adding money, withdrawals and competition payouts.' },
  { key: 'email', name: 'Email', about: 'Sign-up codes, password resets and security alerts.' },
];

const H = 3600e3;

async function check(key, fn) {
  try {
    return await fn();
  } catch (err) {
    return { state: 'down', detail: key === 'data' ? 'Kotka can’t reach its database.' : 'The check couldn’t run.' };
  }
}

/** Runs every check now. Returns { key: { state, detail } }. */
export async function runChecks() {
  const out = { app: { state: 'ok', detail: 'Answering normally.' } };
  const started = Date.now();
  out.data = await check('data', async () => {
    await prisma.$queryRaw`SELECT 1`;
    const ms = Date.now() - started;
    return ms > 2500 ? { state: 'degraded', detail: 'Responding slowly.' } : { state: 'ok', detail: 'Working normally.' };
  });
  if (out.data.state === 'down') {
    for (const c of COMPONENTS) if (!out[c.key]) out[c.key] = { state: 'down', detail: 'Depends on Kotka’s database, which isn’t reachable.' };
    return out;
  }
  const integrations = Object.fromEntries((await prisma.integration.findMany()).map((r) => [r.provider, r]));
  const configured = (k) => !!integrations[k]?.secretCipher && !!integrations[k]?.enabled;

  out.ai = await check('ai', async () => {
    if (!configured('nvidia')) return { state: 'off', detail: 'Not switched on.' };
    const research = await loadResearchSettings();
    const active = effectiveModels(integrations.nvidia, { narrativePreferred: research.model?.trim() || undefined });
    if (!active.chat) return { state: 'down', detail: 'No AI model is answering right now.' };
    return active.vision && active.narrative ? { state: 'ok', detail: 'Working normally.' } : { state: 'degraded', detail: 'Chat works; some features are paused.' };
  });

  out.research = await check('research', async () => {
    const settings = await loadResearchSettings();
    if (!settings.enabled) return { state: 'off', detail: 'Not switched on.' };
    const last = await prisma.researchRun.findFirst({ where: { status: { in: ['succeeded', 'failed'] } }, orderBy: { startedAt: 'desc' }, select: { startedAt: true } });
    const [runs, failed] = await Promise.all([
      prisma.researchRun.count({ where: { startedAt: { gte: new Date(Date.now() - 24 * H) } } }),
      prisma.researchRun.count({ where: { startedAt: { gte: new Date(Date.now() - 24 * H) }, status: 'failed' } }),
    ]);
    if (!last || Date.now() - last.startedAt.getTime() > 6 * H) return { state: 'degraded', detail: 'Reports haven’t updated for a while.' };
    return runs && failed / runs > 0.5 ? { state: 'degraded', detail: 'Some reports didn’t update.' } : { state: 'ok', detail: 'Updating on schedule.' };
  });

  out.payments = await check('payments', async () => {
    const s = await loadGameSettings();
    if (!configured('whop') && !configured('paystack')) return { state: 'off', detail: 'Not set up yet.' };
    if (!s.depositsEnabled && !s.withdrawalsEnabled) return { state: 'degraded', detail: 'Paused by Kotka for now.' };
    const failed = await prisma.paymentWebhookEvent.count({ where: { status: 'failed', receivedAt: { gte: new Date(Date.now() - 6 * H) } } });
    return failed ? { state: 'degraded', detail: 'Some payment updates are delayed; balances are safe.' } : { state: 'ok', detail: 'Working normally.' };
  });

  out.email = { state: configured('resend') || configured('inbox') ? 'ok' : 'off', detail: configured('resend') || configured('inbox') ? 'Sending normally.' : 'Not set up.' };
  return out;
}

/** Saves one sample (from the scheduled jobs). */
export async function recordStatusSample() {
  const checks = await runChecks();
  const flat = Object.fromEntries(Object.entries(checks).map(([k, v]) => [k, v.state]));
  await prisma.statusSample.create({ data: { checks: flat } });
  if (Math.random() < 0.02) prisma.statusSample.deleteMany({ where: { at: { lt: new Date(Date.now() - 100 * 24 * H) } } }).catch(() => {});
  return flat;
}

let cached = null;

/** The status page: live checks (cached briefly) and up to 90 days of history. */
export async function statusPage({ days = 90 } = {}) {
  if (cached && cached.until > Date.now()) return cached.value;
  const checks = await runChecks();
  const since = new Date(Date.now() - days * 24 * H);
  const samples = await prisma.statusSample.findMany({ where: { at: { gte: since } }, select: { at: true, checks: true }, orderBy: { at: 'asc' } });
  const dayKey = (d) => d.toISOString().slice(0, 10);
  const byDay = new Map();
  for (const s of samples) {
    const k = dayKey(s.at);
    if (!byDay.has(k)) byDay.set(k, []);
    byDay.get(k).push(s.checks);
  }
  const history = COMPONENTS.map((c) => {
    const series = [];
    let up = 0;
    let total = 0;
    for (let i = days - 1; i >= 0; i--) {
      const k = dayKey(new Date(Date.now() - i * 24 * H));
      const list = (byDay.get(k) ?? []).map((x) => x[c.key]).filter((v) => v && v !== 'off');
      const ok = list.filter((v) => v === 'ok').length;
      const bad = list.filter((v) => v === 'down').length;
      series.push(list.length ? { date: k, samples: list.length, ok, down: bad, degraded: list.length - ok - bad } : { date: k, samples: 0 });
      up += ok;
      total += list.length;
    }
    return { key: c.key, days: series, uptimePct: total ? Math.round((up / total) * 1000) / 10 : null };
  });
  const states = Object.values(checks).map((c) => c.state);
  const overall = states.includes('down') ? 'down' : states.includes('degraded') ? 'degraded' : 'ok';
  const value = {
    checkedAt: new Date(),
    overall,
    components: COMPONENTS.map((c) => ({ ...c, ...checks[c.key] })),
    history,
    since: samples[0]?.at ?? null,
  };
  cached = { value, until: Date.now() + 30e3 };
  return value;
}
