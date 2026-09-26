// Stage 1 of the research pipeline: gather evidence. Nothing here interprets
// data — it retrieves, normalizes, and records exactly where each piece came
// from and whether the retrieval succeeded.

import { prisma } from '../prisma.js';
import { decryptSecret } from '../crypto.js';
import { cachedSource, HOUR } from './cache.js';
import { CURRENCIES, IMF_INDICATORS, SUPPORTED_CURRENCY_CODES } from './currencies.js';
import { listWeoDataflows, fetchWeo, fetchCofer, vintageLabel } from './sources/imf.js';
import { fetchFred, fetchEcb, fetchEurostat, fetchBis } from './sources/timeseries.js';
import { STATEMENT_FETCHERS, keySentences } from './sources/statements.js';
import { fetchFomcMeetings, fetchEcbMeetings, fetchBlsReleases, fetchBeaReleases, fetchEurostatReleases } from './sources/calendars.js';
import { changePoints, yoy, DAY } from './series.js';

const TTL = {
  weoFlows: 24 * HOUR,
  weoCurrent: 24 * HOUR,
  weoPrevious: 7 * 24 * HOUR,
  cofer: 24 * HOUR,
  daily: 6 * HOUR,
  monthly: 12 * HOUR,
  bis: 12 * HOUR,
  statements: 6 * HOUR,
  calendars: 12 * HOUR,
};

const BIS_NAMES = {
  WS_CBPOL: 'BIS central bank policy rates',
  WS_LONG_CPI: 'BIS consumer prices',
  WS_EER: 'BIS effective exchange rates',
};

const isoDaysAgo = (now, days) => new Date(now.getTime() - days * DAY).toISOString().slice(0, 10);

function startFor(def, now) {
  if (def.history === 'long') return isoDaysAgo(now, 11 * 365);
  if (def.compress === 'changes') return isoDaysAgo(now, 3 * 365);
  if (def.frequency === 'D') return isoDaysAgo(now, 450);
  if (def.frequency === 'W') return isoDaysAgo(now, 2 * 365);
  if (def.frequency === 'M') return isoDaysAgo(now, 4 * 365);
  return isoDaysAgo(now, 5 * 365);
}

// Policy-rate style series are stored as change events + the latest point,
// which keeps "last change" detection exact while keeping cache rows small.
function postProcess(def, series) {
  let points = series.points;
  if (def.transform === 'yoy') points = yoy(points);
  if (def.compress === 'changes' && points.length) {
    const changes = changePoints(points).map(({ date, value }) => ({ date, period: date, value }));
    const lastPoint = points[points.length - 1];
    if (changes[changes.length - 1]?.date !== lastPoint.date) changes.push(lastPoint);
    points = changes;
    return { frequency: series.frequency, points, compressed: true, windowStart: series.points[0]?.date ?? null };
  }
  return { frequency: series.frequency, points };
}

async function getFredApiKey() {
  const row = await prisma.integration.findUnique({ where: { provider: 'fred' } }).catch(() => null);
  if (!row || !row.enabled || !row.secretCipher) return null;
  try {
    return decryptSecret(row.secretCipher);
  } catch {
    return null;
  }
}

export async function collectEvidence(codes, { settings, now = new Date(), bypassCache = false } = {}) {
  const enabled = settings.sources ?? {};
  const statuses = [];
  const track = async (id, name, fn, { disabled = false } = {}) => {
    if (disabled) {
      statuses.push({ id, name, status: 'disabled' });
      return null;
    }
    const started = Date.now();
    try {
      const res = await fn();
      statuses.push({ id, name, status: res.cached ? 'cached' : 'ok', fetchedAt: res.fetchedAt, ms: Date.now() - started });
      return res.data;
    } catch (err) {
      statuses.push({ id, name, status: 'failed', error: String(err.message ?? err).slice(0, 240), ms: Date.now() - started });
      return null;
    }
  };

  const allImf = SUPPORTED_CURRENCY_CODES.map((c) => CURRENCIES[c].imf);
  const indicators = Object.keys(IMF_INDICATORS);
  const year = now.getUTCFullYear();
  const fredApiKey = await getFredApiKey();

  // ── IMF World Economic Outlook: current dataset + previous vintage ──
  const imfTask = (async () => {
    if (enabled.imf_weo === false) {
      statuses.push({ id: 'imf_weo', name: 'IMF World Economic Outlook', status: 'disabled' });
      return { current: null, previous: null };
    }
    const flows = await track('imf_weo_flows', 'IMF WEO vintage catalogue', () => cachedSource('imf:weo:flows', TTL.weoFlows, listWeoDataflows, { bypass: bypassCache }));
    const currentFlow = flows?.find((f) => f.id === 'WEO') ?? { id: 'WEO', version: '9.0.0' };
    const params = { countries: allImf, indicators, startYear: year - 3, endYear: year + 5 };
    const current = await track('imf_weo', 'IMF World Economic Outlook (current)', () =>
      cachedSource(`imf:weo:${currentFlow.id}:${currentFlow.version}:${year}`, TTL.weoCurrent, () => fetchWeo({ dataflow: currentFlow.id, version: currentFlow.version, ...params }), { bypass: bypassCache }),
    );
    let previous = null;
    if (current?.publicationDate && flows) {
      const curMonth = current.publicationDate.slice(0, 7);
      const candidates = flows.filter((f) => f.vintageDate && f.vintageDate.slice(0, 7) < curMonth).sort((a, b) => b.vintageDate.localeCompare(a.vintageDate));
      const prevFlow = candidates[0];
      if (prevFlow) {
        previous = await track('imf_weo_previous', `IMF World Economic Outlook (${vintageLabel(prevFlow.vintageDate)} vintage)`, () =>
          cachedSource(`imf:weo:${prevFlow.id}:${prevFlow.version}:${year}`, TTL.weoPrevious, async () => ({ ...(await fetchWeo({ dataflow: prevFlow.id, version: prevFlow.version, ...params })), vintageDate: prevFlow.vintageDate }), { bypass: bypassCache }),
        );
      }
    }
    return { current, previous };
  })();

  // ── IMF COFER ──
  const coferCodes = SUPPORTED_CURRENCY_CODES.map((c) => CURRENCIES[c].cofer).filter(Boolean);
  const coferTask = track('imf_cofer', 'IMF COFER (currency composition of FX reserves)', () =>
    cachedSource(`imf:cofer:${coferCodes.join('+')}`, TTL.cofer, () => fetchCofer({ currencies: coferCodes, startPeriod: `${year - 3}-Q1` }), { bypass: bypassCache }),
    { disabled: enabled.imf_cofer === false },
  );

  // ── BIS: one request per dataflow, covering every supported area ──
  const bisDefs = {};
  for (const c of SUPPORTED_CURRENCY_CODES) {
    for (const def of Object.values(CURRENCIES[c].series)) {
      if (def.provider === 'bis') bisDefs[def.dataflow] ??= { def, areas: new Set() };
      if (def.provider === 'bis') bisDefs[def.dataflow].areas.add(def.area);
    }
  }
  const bisTasks = Object.fromEntries(
    Object.entries(bisDefs).map(([flow, { def, areas }]) => {
      const list = [...areas].sort();
      const start = startFor(def, now);
      return [
        flow,
        track(`bis_${flow}`, BIS_NAMES[flow] ?? `BIS ${flow}`, () => cachedSource(`bis:${flow}:${list.join('+')}:${start.slice(0, 7)}`, TTL.bis, () => fetchBis(flow, def.keyTemplate, list, { frequency: def.frequency, start }), { bypass: bypassCache }), {
          disabled: enabled.bis === false,
        }),
      ];
    }),
  );

  // ── Per-currency national series ──
  const seriesTasks = {};
  for (const code of codes) {
    const cfg = CURRENCIES[code];
    seriesTasks[code] = {};
    for (const [role, def] of Object.entries(cfg.series)) {
      if (def.provider === 'bis') continue;
      const start = startFor(def, now);
      const ttl = def.frequency === 'D' ? TTL.daily : TTL.monthly;
      let key;
      let fetcher;
      if (def.provider === 'fred') {
        key = `fred:${def.id}:${start.slice(0, 7)}`;
        fetcher = async () => postProcess(def, await fetchFred(def.id, { frequency: def.frequency, start, apiKey: fredApiKey }));
      } else if (def.provider === 'ecb') {
        key = `ecb:${def.flow}:${def.key}:${start.slice(0, 7)}`;
        fetcher = async () => postProcess(def, await fetchEcb(def.flow, def.key, { frequency: def.frequency, start }));
      } else if (def.provider === 'eurostat') {
        key = `eurostat:${def.dataset}:${JSON.stringify(def.filters)}:${start.slice(0, 4)}`;
        fetcher = async () => postProcess(def, await fetchEurostat(def.dataset, def.filters, { frequency: def.frequency, sinceTimePeriod: `${start.slice(0, 4)}-Q1` }));
      } else {
        continue;
      }
      seriesTasks[code][role] = track(`${code}.${role}`, `${def.label} (${def.source.name})`, () => cachedSource(key, ttl, fetcher, { bypass: bypassCache }), {
        disabled: enabled[def.provider] === false,
      });
    }
  }

  // ── Central bank statements ──
  const statementTasks = {};
  for (const code of codes) {
    const key = CURRENCIES[code].centralBank.statement;
    if (!key) continue;
    statementTasks[code] = track(`${code}.statement`, `${CURRENCIES[code].centralBank.name} — latest policy statement`, () => cachedSource(`statement:${key}`, TTL.statements, () => STATEMENT_FETCHERS[key](now), { bypass: bypassCache }), {
      disabled: enabled.statements === false,
    });
  }

  // ── Calendars ──
  const calendarKeys = new Set();
  for (const code of codes) {
    const cfg = CURRENCIES[code];
    if (cfg.centralBank.meetings) calendarKeys.add(cfg.centralBank.meetings);
    for (const k of cfg.releaseCalendars) calendarKeys.add(k);
  }
  const horizonEnd = new Date(now.getTime() + 75 * DAY);
  const calendarFetchers = {
    fomc: fetchFomcMeetings,
    ecb: fetchEcbMeetings,
    bls: fetchBlsReleases,
    bea: fetchBeaReleases,
    eurostat: () => fetchEurostatReleases(new Date(now.getTime() - DAY), horizonEnd),
  };
  const calendarTasks = Object.fromEntries(
    [...calendarKeys].map((k) => [
      k,
      track(`calendar.${k}`, `Calendar: ${k.toUpperCase()}`, () => cachedSource(`calendar:${k}:${now.toISOString().slice(0, 10)}`, TTL.calendars, calendarFetchers[k], { bypass: bypassCache }), {
        disabled: enabled.calendars === false,
      }),
    ]),
  );

  const assessmentsTask = prisma.sourceAssessment.findMany({ where: { currency: { in: codes } }, orderBy: { publishedAt: 'desc' } }).catch(() => []);

  const [imf, cofer, assessments] = await Promise.all([imfTask, coferTask, assessmentsTask]);
  const bis = Object.fromEntries(await Promise.all(Object.entries(bisTasks).map(async ([k, p]) => [k, await p])));
  const calendars = Object.fromEntries(await Promise.all(Object.entries(calendarTasks).map(async ([k, p]) => [k, await p])));

  const perCurrency = {};
  for (const code of codes) {
    const cfg = CURRENCIES[code];
    const series = {};
    for (const [role, def] of Object.entries(cfg.series)) {
      if (def.provider === 'bis') {
        const bisSeries = bis[def.dataflow]?.[def.area];
        series[role] = bisSeries ? postProcess(def, bisSeries) : null;
        if (bisSeries?.sourceRef) series[role].sourceRef = bisSeries.sourceRef;
      } else {
        series[role] = (await seriesTasks[code][role]) ?? null;
      }
    }
    const statement = statementTasks[code] ? await statementTasks[code] : null;
    perCurrency[code] = {
      series,
      statement: statement ? { ...statement, keySentences: keySentences(statement.text) } : null,
      cofer: cfg.cofer ? cofer?.[cfg.cofer] ?? null : null,
      assessments: assessments.filter((a) => a.currency === code),
    };
  }

  return {
    retrievedAt: now.toISOString(),
    imf,
    calendars,
    currencies: perCurrency,
    sourceStatus: statuses,
    fredMode: fredApiKey ? 'api' : 'public-csv',
  };
}
