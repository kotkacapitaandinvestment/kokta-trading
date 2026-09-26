// Orchestrates a research run: gather evidence → evaluate → compare → score →
// explain → persist. Reports are cached in ResearchReport; every stored report
// is also a point in the fundamental-trend history.

import { prisma } from '../prisma.js';
import { decryptSecret } from '../crypto.js';
import { fetchHistoricalBars } from '../massive.js';
import { CURRENCIES, parseSubject } from './currencies.js';
import { collectEvidence } from './collect.js';
import { evaluateCurrency } from './evaluate.js';
import { evaluatePair, fetchPairPricePerformance } from './pair.js';
import { reconstructTrends, whatChanged, scoreChange } from './history.js';
import { buildCatalysts, buildInvalidation } from './catalysts.js';
import { generateNarrative, rulesNarrative } from './narrative.js';
import { CALENDAR_SOURCES } from './sources/calendars.js';
import { humanPeriod, periodEnd, periodStart } from './series.js';
import { loadSettings } from './settings.js';

const HOUR = 60 * 60 * 1000;
const RUN_LOCK_MS = 5 * 60 * 1000;
export const REPORT_VERSION = 2;

export class ResearchError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export async function latestReport(kind, subject) {
  return prisma.researchReport.findFirst({ where: { kind, subject }, orderBy: { createdAt: 'desc' } });
}

// Latest report per subject without loading payloads (one query), for status
// pages and the cron picker.
export async function latestReportSummaries() {
  // Pick the latest ids first so only those payloads are read for the version.
  const rows = await prisma.$queryRaw`
    SELECT r.id, r.kind, r.subject, r.score, r.confidence, r.condition, r.direction, r."narrativeSource", r."createdAt",
      (r.payload->>'version')::int AS version
    FROM "ResearchReport" r
    JOIN (
      SELECT DISTINCT ON (kind, subject) id FROM "ResearchReport" ORDER BY kind, subject, "createdAt" DESC
    ) latest ON latest.id = r.id`;
  return new Map(rows.map((r) => [`${r.kind}:${r.subject}`, { ...r, payload: { version: r.version } }]));
}

export function freshnessOf(row, settings) {
  if (!row) return null;
  const created = new Date(row.createdAt).getTime();
  const next = created + settings.refreshHours * HOUR;
  return {
    lastUpdated: new Date(created).toISOString(),
    nextRefresh: new Date(next).toISOString(),
    ageHours: Math.round(((Date.now() - created) / HOUR) * 10) / 10,
    stale: Date.now() >= next || row.payload?.version !== REPORT_VERSION,
    refreshHours: settings.refreshHours,
  };
}

export async function activeRun(subject) {
  return prisma.researchRun.findFirst({
    where: { subject, status: 'running', startedAt: { gte: new Date(Date.now() - RUN_LOCK_MS) } },
    orderBy: { startedAt: 'desc' },
  });
}

async function getMassiveKey() {
  const row = await prisma.integration.findUnique({ where: { provider: 'massive' } }).catch(() => null);
  if (!row || !row.enabled || !row.secretCipher) return null;
  try {
    return decryptSecret(row.secretCipher);
  } catch {
    return null;
  }
}

function imfView(ev, assessments) {
  const imf = ev.imf;
  const statements = [];
  if (imf) {
    const g = imf.growth;
    const rev = (ind, year) => ev.revisions.find((r) => r.indicator === ind && r.year === year && r.kind === 'FORECAST_REVISION');
    const gr = rev('NGDP_RPCH', g.year);
    const gr1 = rev('NGDP_RPCH', g.year + 1);
    if (g.current != null) {
      statements.push({
        kind: 'SOURCE ASSESSMENT',
        text: `The IMF projects ${ev.economy} real GDP growth of ${g.current.toFixed(2)}% in ${g.year}${g.next != null ? ` and ${g.next.toFixed(2)}% in ${g.year + 1}` : ''} (${imf.currentVintage} WEO)${gr ? `, ${gr.revision >= 0 ? 'up' : 'down'} from ${gr.previous.toFixed(2)}%${gr1 ? ` and ${gr1.previous.toFixed(2)}%` : ''} in the ${gr.previousVintage} WEO` : ''}.`,
      });
    }
    if (imf.inflation.current != null) {
      const ir = rev('PCPIPCH', g.year);
      statements.push({ kind: 'SOURCE ASSESSMENT', text: `It projects average consumer price inflation of ${imf.inflation.current.toFixed(2)}% in ${g.year}${ir ? ` (${ir.revision >= 0 ? 'revised up' : 'revised down'} from ${ir.previous.toFixed(2)}%)` : ''}.` });
    }
    if (imf.fiscalBalance != null && imf.debt != null) {
      statements.push({ kind: 'SOURCE ASSESSMENT', text: `It projects a general government balance of ${imf.fiscalBalance.toFixed(1)}% of GDP and gross debt of ${imf.debt.toFixed(1)}% of GDP in ${g.year}, with a current account of ${imf.currentAccount?.toFixed(1) ?? 'n/a'}% of GDP.` });
    }
  }
  const curated = assessments
    .filter((a) => ['imf_view', 'valuation'].includes(a.factor))
    .map((a) => ({ kind: 'SOURCE ASSESSMENT', institution: a.institution, title: a.title, classification: a.classification, text: a.statement, url: a.url, publishedAt: new Date(a.publishedAt).toISOString(), curated: true }));
  const valuation = ev.factors.valuation;
  return {
    available: !!imf,
    vintage: imf?.currentVintage ?? null,
    published: imf?.currentPublished ?? null,
    previousVintage: imf?.previousVintage ?? null,
    statements,
    curated,
    formalQualitative: curated.some((c) => c.institution?.toLowerCase().includes('international monetary fund') || c.institution?.toUpperCase().includes('IMF')) ? null : 'FORMAL IMF ASSESSMENT (qualitative): NOT AVAILABLE — no Article IV or External Sector Report text has been recorded for this currency.',
    valuation: valuation.available ? { classification: valuation.classification, rationale: valuation.rationale } : { classification: 'IMF FORMAL VALUATION: NOT AVAILABLE', rationale: valuation.unavailableReason },
    interpretation: ev.factors.imf_revisions?.available ? ev.factors.imf_revisions.rationale : null,
  };
}

// Sources grouped by institution, each listing the specific series or
// publications used, so every figure in a report links to its origin.
function collectSources(evals, evidence, catalysts, extra = []) {
  const groups = new Map();
  const add = (name, tier, item) => {
    if (!item?.url) return;
    const g = groups.get(name) ?? { name, tier, items: new Map(), dataTypes: new Set() };
    if (!g.items.has(item.url)) g.items.set(item.url, { label: item.label, url: item.url, via: item.via ?? null, currency: item.currency ?? null });
    if (item.dataType) g.dataTypes.add(item.dataType);
    groups.set(name, g);
  };
  for (const ev of Object.values(evals)) {
    for (const o of Object.values(ev.observations)) {
      if (o.derivedFrom) continue;
      add(o.source.name, o.source.tier, { label: o.label.replace(/ - IMF projection$/, '').replace(/ — IMF projection$/, ''), url: o.source.url, via: o.source.via, dataType: o.dataType, currency: o.currency });
    }
    add(ev.centralBank.name, 2, { label: `Inflation target: ${ev.centralBank.targetText}`, url: ev.centralBank.targetUrl, dataType: 'SOURCE ASSESSMENT' });
  }
  for (const cur of Object.values(evidence.currencies)) {
    if (cur.statement) add(cur.statement.institution, 2, { label: `${cur.statement.title} (${humanPeriod(cur.statement.publishedAt?.slice(0, 10))})`, url: cur.statement.url, dataType: 'SOURCE ASSESSMENT' });
  }
  const CAL_OWNER = { fomc: 'Federal Reserve', ecb: 'European Central Bank', bls: 'U.S. Bureau of Labor Statistics', bea: 'U.S. Bureau of Economic Analysis', eurostat: 'Eurostat' };
  for (const k of Object.keys(evidence.calendars ?? {})) {
    if (evidence.calendars[k]) add(CAL_OWNER[k], CALENDAR_SOURCES[k].tier, { label: CALENDAR_SOURCES[k].name.split(' — ').pop().replace(/^./, (c) => c.toUpperCase()), url: CALENDAR_SOURCES[k].url, dataType: 'CALENDAR' });
  }
  if (catalysts.items.some((c) => c.category === 'imf')) add('International Monetary Fund', 1, { label: 'World Economic Outlook publications', url: 'https://www.imf.org/en/Publications/WEO', dataType: 'CALENDAR' });
  for (const s of extra) add(s.name, s.tier, { label: s.label ?? s.name, url: s.url, dataType: s.dataType });
  return [...groups.values()]
    .map((g) => {
      const items = [...g.items.values()];
      const counts = items.reduce((m, it) => m.set(it.label, (m.get(it.label) ?? 0) + 1), new Map());
      return {
        name: g.name,
        tier: g.tier,
        items: items.map(({ currency, ...it }) => (counts.get(it.label) > 1 && currency ? { ...it, label: `${it.label} (${currency})` } : it)),
        dataTypes: [...g.dataTypes],
      };
    })
    .sort((a, b) => (Number(a.tier) || 9) - (Number(b.tier) || 9) || a.name.localeCompare(b.name));
}

function dataFreshness(evals) {
  // Official growth, inflation and labour releases only (market series update
  // daily; REER and reserve shares are context, not releases).
  const RELEASES = /\.(targetInflation|coreInflation|headlineCpi|coreCpi|gdpYoY|gdpQoQ|unemployment)$/;
  const obs = Object.values(evals).flatMap((ev) => Object.values(ev.observations)).filter((o) => RELEASES.test(o.id) && o.period);
  let latest = null;
  for (const o of obs) {
    const end = periodEnd(periodStart(o.period), o.frequency).getTime();
    if (!latest || end > latest.end) latest = { end, label: o.label, period: o.periodLabel, currency: o.currency };
  }
  const monthlyOrSlower = obs.filter((o) => ['M', 'Q'].includes(o.frequency));
  const oldest = monthlyOrSlower.sort((a, b) => b.ageDays - a.ageDays)[0];
  return {
    latestData: latest ? { label: latest.label, period: latest.period, currency: latest.currency } : null,
    oldestKeyData: oldest ? { label: oldest.label, period: oldest.periodLabel, currency: oldest.currency, ageDays: oldest.ageDays } : null,
    imf: Object.values(evals).find((e) => e.imf)?.imf ? { vintage: Object.values(evals).find((e) => e.imf).imf.currentVintage, published: Object.values(evals).find((e) => e.imf).imf.currentPublished } : null,
    notes: mergeFreshnessNotes(Object.values(evals)),
  };
}

function mergeFreshnessNotes(evals) {
  const withNote = evals.filter((e) => e.notes.some((n) => n.kind === 'freshness'));
  if (!withNote.length) return [];
  const imf = withNote[0].imf;
  const newer = withNote.map((e) => {
    const data = [e.observations[`${e.code}.gdpYoY`], e.observations[`${e.code}.targetInflation`]].filter(Boolean).sort((a, b) => b.period.localeCompare(a.period))[0];
    return data ? `${e.code} ${data.label.replace(/ \(y\/y\)$/, '')} (${data.periodLabel})` : e.code;
  });
  return [{ kind: 'freshness', text: `IMF projections are from the ${imf.currentVintage} World Economic Outlook (published ${humanPeriod(imf.currentPublished.slice(0, 10))}). Official data released since then is more recent than those projections, e.g. ${newer.join('; ')}.` }];
}

function centralBanks(evals, evidence) {
  return Object.fromEntries(
    Object.values(evals).map((ev) => {
      const st = evidence.currencies[ev.code]?.statement;
      return [
        ev.code,
        {
          name: ev.centralBank.name,
          short: ev.centralBank.short,
          targetText: ev.centralBank.targetText,
          targetUrl: ev.centralBank.targetUrl,
          stance: ev.policy?.stance ?? null,
          rate: ev.policy?.display ?? null,
          realRate: ev.policy?.realRate ?? null,
          lastChange: ev.policy?.lastChange ?? null,
          recentChanges: ev.policy?.recentChanges ?? [],
          rationale: ev.factors.monetary_policy?.rationale ?? null,
          statement: st ? { institution: st.institution, title: st.title, url: st.url, publishedAt: st.publishedAt, keySentences: st.keySentences } : null,
          statementNote: st ? null : CURRENCIES[ev.code].centralBank.statement ? 'Latest statement could not be retrieved on this run.' : `Automated statement retrieval is not yet configured for the ${ev.centralBank.name}.`,
          marketExpectations: ev.marketExpectations,
        },
      ];
    }),
  );
}

async function assemble({ kind, subject, codes, evals, evidence, trends, pairEval, catalysts, invalidation, baseline, baselineDate, settings, previous, withNarrative }) {
  const now = new Date(evidence.retrievedAt);
  const directions = Object.fromEntries(Object.entries(trends).map(([k, t]) => [k, t.direction]));
  const report = {
    version: REPORT_VERSION,
    kind,
    subject,
    base: codes[0],
    quote: codes[1] ?? null,
    generatedAt: now.toISOString(),
    currencies: Object.fromEntries(codes.map((c) => [c, evals[c]])),
    trends: Object.fromEntries(Object.entries(trends).filter(([k]) => codes.includes(k) || k === subject)),
    directions,
    pair: kind === 'pair' ? pairEval : null,
    catalysts,
    invalidation,
    whatChanged: Object.fromEntries(codes.map((c) => [c, whatChanged(evals[c], baseline[c], baselineDate)])),
    sinceLastResearch: scoreChange(previous, kind === 'pair' ? pairEval.relativeScore : evals[codes[0]].score),
    centralBanks: centralBanks(Object.fromEntries(codes.map((c) => [c, evals[c]])), evidence),
    imfView: Object.fromEntries(codes.map((c) => [c, imfView(evals[c], evidence.currencies[c].assessments)])),
    dataFreshness: dataFreshness(Object.fromEntries(codes.map((c) => [c, evals[c]]))),
    sourceStatus: evidence.sourceStatus,
    fredMode: evidence.fredMode,
  };
  report.sources = collectSources(
    Object.fromEntries(codes.map((c) => [c, evals[c]])),
    { ...evidence, currencies: Object.fromEntries(codes.map((c) => [c, evidence.currencies[c]])) },
    catalysts,
    pairEval?.marketPrice?.available ? [{ ...pairEval.marketPrice.source, label: `${subject} daily prices`, tier: 'market', dataType: 'MARKET PRICE' }] : [],
  );
  report.verdict =
    kind === 'pair'
      ? {
          instrument: subject,
          score: pairEval.relativeScore,
          confidence: pairEval.confidence,
          condition: pairEval.condition,
          baseCondition: evals[codes[0]].condition,
          quoteCondition: evals[codes[1]].condition,
          direction: directions[subject]?.label ?? null,
        }
      : { instrument: subject, score: evals[codes[0]].score, confidence: evals[codes[0]].confidence, condition: evals[codes[0]].condition, band: evals[codes[0]].band, direction: directions[subject]?.label ?? null };
  report.narrative = withNarrative ? await generateNarrative(report, settings) : { ...rulesNarrative(report), source: 'rules', model: null, validation: { accepted: [], rejected: [] } };
  return report;
}

export async function runResearch({ subject: rawSubject, trigger = 'user', userId = null, bypassCache = false, onStep = () => {} }) {
  const parsed = parseSubject(rawSubject);
  if (!parsed) throw new ResearchError('invalid_subject', 'Unsupported currency or pair.', 404);
  const settings = await loadSettings();
  const codes = parsed.kind === 'pair' ? [parsed.base, parsed.quote] : [parsed.base];
  for (const c of codes) if (!settings.currencies.includes(c)) throw new ResearchError('unsupported', `${c} is not enabled for Fundamental Research.`, 404);
  if (parsed.kind === 'pair' && !settings.pairs.includes(parsed.subject) && trigger !== 'admin') throw new ResearchError('unsupported', `${parsed.subject} is not an enabled pair.`, 404);

  if (await activeRun(parsed.subject)) throw new ResearchError('in_progress', 'Research for this instrument is already running.', 409);
  const run = await prisma.researchRun.create({ data: { kind: parsed.kind, subject: parsed.subject, trigger, userId } });
  const started = Date.now();
  const step = (id, label, status = 'running', detail = null) => onStep({ type: 'step', id, label, status, detail });

  try {
    const now = new Date();
    step('retrieve', 'Retrieving official data — IMF, central banks, statistics offices, BIS');
    const evidence = await collectEvidence(codes, { settings, now, bypassCache });
    const failed = evidence.sourceStatus.filter((s) => s.status === 'failed');
    step('retrieve', 'Retrieving official data — IMF, central banks, statistics offices, BIS', 'done', `${evidence.sourceStatus.filter((s) => s.status === 'ok' || s.status === 'cached').length} sources retrieved${failed.length ? `, ${failed.length} unavailable` : ''}`);

    step('evaluate', 'Normalizing evidence and scoring each factor');
    const evals = Object.fromEntries(codes.map((c) => [c, evaluateCurrency(c, evidence, { asOf: now })]));
    step('evaluate', 'Normalizing evidence and scoring each factor', 'done', codes.map((c) => `${c} ${evals[c].score ?? 'n/a'}/100`).join(' · '));

    step('compare', 'Comparing forecast revisions and reconstructing the fundamental trend');
    const { trends, baseline, baselineDate } = reconstructTrends(codes, evidence, now, evals, { pair: parsed.kind === 'pair' ? parsed : null });
    step('compare', 'Comparing forecast revisions and reconstructing the fundamental trend', 'done');

    let pairEval = null;
    if (parsed.kind === 'pair') {
      step('pair', `Relative analysis — ${parsed.base} vs ${parsed.quote}`);
      let marketPrice = null;
      try {
        marketPrice = await fetchPairPricePerformance(parsed.subject, { getMassiveKey, fetchHistoricalBars });
      } catch (err) {
        marketPrice = { available: false, reason: `Price history unavailable: ${String(err.message).slice(0, 120)}` };
      }
      pairEval = evaluatePair(evals[parsed.base], evals[parsed.quote], { marketPrice });
      step('pair', `Relative analysis — ${parsed.base} vs ${parsed.quote}`, 'done', `${pairEval.condition} · ${pairEval.relativeScore}/100`);
    }

    step('catalysts', 'Mapping upcoming catalysts and invalidation conditions');
    const catalysts = buildCatalysts(codes, evals, evidence, { now, horizonDays: settings.catalystHorizonDays });
    const invalidation = buildInvalidation(evals, catalysts, { pair: pairEval });
    step('catalysts', 'Mapping upcoming catalysts and invalidation conditions', 'done', `${catalysts.items.filter((c) => c.date).length} dated events`);

    const previous = await latestReport(parsed.kind, parsed.subject);
    step('narrative', settings.aiNarrative ? 'Writing the evidence-bound narrative' : 'Composing the narrative from rules');
    const report = await assemble({ kind: parsed.kind, subject: parsed.subject, codes, evals, evidence, trends, pairEval, catalysts, invalidation, baseline, baselineDate, settings, previous, withNarrative: true });
    const nv = report.narrative.validation;
    step('narrative', settings.aiNarrative ? 'Writing the evidence-bound narrative' : 'Composing the narrative from rules', 'done', report.narrative.source === 'ai' ? `${nv.accepted.length} sections verified${nv.rejected.length ? `, ${nv.rejected.length} replaced by rules` : ''}` : nv.note ?? 'Rules-based narrative');

    step('save', 'Saving report');
    const durationMs = Date.now() - started;
    const row = await prisma.researchReport.create({
      data: {
        kind: parsed.kind,
        subject: parsed.subject,
        score: report.verdict.score,
        confidence: report.verdict.confidence,
        condition: report.verdict.condition,
        direction: report.verdict.direction,
        payload: report,
        narrativeSource: report.narrative.source,
        model: report.narrative.model,
        durationMs,
      },
    });

    // A pair run also records each currency's own report, so single-currency
    // views and per-currency history stay current without another fetch.
    if (parsed.kind === 'pair') {
      for (const c of codes) {
        const existing = await latestReport('currency', c);
        if (existing && Date.now() - new Date(existing.createdAt).getTime() < settings.refreshHours * HOUR && existing.payload?.version === REPORT_VERSION) continue;
        const cCatalysts = buildCatalysts([c], evals, evidence, { now, horizonDays: settings.catalystHorizonDays });
        const cReport = await assemble({ kind: 'currency', subject: c, codes: [c], evals, evidence, trends, pairEval: null, catalysts: cCatalysts, invalidation: buildInvalidation({ [c]: evals[c] }, cCatalysts), baseline, baselineDate, settings, previous: existing, withNarrative: false });
        await prisma.researchReport.create({ data: { kind: 'currency', subject: c, score: cReport.verdict.score, confidence: cReport.verdict.confidence, condition: cReport.verdict.condition, direction: cReport.verdict.direction, payload: cReport, narrativeSource: 'rules', durationMs } });
      }
    }

    await prisma.researchRun.update({ where: { id: run.id }, data: { status: 'succeeded', finishedAt: new Date(), reportId: row.id, sourceStatus: evidence.sourceStatus } });
    step('save', 'Saving report', 'done');
    return row;
  } catch (err) {
    await prisma.researchRun.update({ where: { id: run.id }, data: { status: 'failed', finishedAt: new Date(), error: String(err.message ?? err).slice(0, 500) } }).catch(() => {});
    throw err;
  }
}

export async function reportHistory(kind, subject, limit = 60) {
  const rows = await prisma.researchReport.findMany({
    where: { kind, subject },
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: { id: true, score: true, confidence: true, condition: true, direction: true, createdAt: true, narrativeSource: true },
  });
  return rows.reverse();
}

// Refreshes the stalest enabled pairs. Designed for an external scheduler
// (cron-job.org): the route responds immediately and this runs afterwards.
// No new pair is started after `budgetMs`; with the 100s narrative cap a
// started run finishes well inside the 300s function limit.
export async function runCronBatch({ budgetMs = 150000 } = {}) {
  const settings = await loadSettings();
  if (!settings.enabled) return { skipped: 'Fundamental Research is disabled.' };
  const started = Date.now();
  const candidates = [];
  const latest = await latestReportSummaries();
  for (const pair of settings.pairs) {
    const row = latest.get(`pair:${pair}`) ?? null;
    const f = freshnessOf(row, settings);
    if (!row || f.stale) candidates.push({ pair, age: row ? Date.now() - new Date(row.createdAt).getTime() : Infinity });
  }
  candidates.sort((a, b) => b.age - a.age);
  const results = [];
  for (const c of candidates.slice(0, settings.cron.batchSize)) {
    if (Date.now() - started > budgetMs) break;
    try {
      const row = await runResearch({ subject: c.pair, trigger: 'cron' });
      results.push({ subject: c.pair, ok: true, reportId: row.id });
    } catch (err) {
      results.push({ subject: c.pair, ok: false, error: err.message });
    }
  }
  return { refreshed: results, remainingStale: Math.max(0, candidates.length - results.length) };
}
