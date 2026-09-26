// Adapters for official time-series APIs. Each returns { frequency, points }.
//  - FRED (Federal Reserve Bank of St. Louis) — redistributes Fed Board, BLS and BEA series.
//  - ECB Data Portal — ECB policy rates, HICP, yield curve, CISS, long-term rates.
//  - Eurostat — euro-area national accounts.
//  - BIS — central bank policy rates, consumer prices and effective exchange rates
//    compiled from national central banks / statistical offices.

import { fetchText, fetchJson, parseCsv, toNumber } from '../http.js';
import { normalizePoints, periodStart } from '../series.js';

// ── FRED ──────────────────────────────────────────────────────────────────
export async function fetchFred(id, { frequency, start, apiKey }) {
  let raw;
  if (apiKey) {
    const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${id}&api_key=${apiKey}&file_type=json&observation_start=${start}`;
    const data = await fetchJson(url, { timeoutMs: 20000 });
    raw = (data.observations ?? []).map((o) => ({ date: o.date, value: toNumber(o.value) }));
  } else {
    const csv = await fetchText(`https://fred.stlouisfed.org/graph/fredgraph.csv?id=${id}&cosd=${start}`, { timeoutMs: 30000 });
    raw = parseCsv(csv).map((r) => {
      const [dateKey, valueKey] = Object.keys(r);
      return { date: r[dateKey], value: toNumber(r[valueKey] ?? r[id]) };
    });
  }
  return { frequency, points: normalizePoints(raw, frequency) };
}

export const fredSeriesUrl = (id) => `https://fred.stlouisfed.org/series/${id}`;

export async function fredTestConnection(apiKey) {
  const data = await fetchJson(`https://api.stlouisfed.org/fred/series?series_id=DFEDTARU&api_key=${apiKey}&file_type=json`, { timeoutMs: 15000, retries: 0 });
  const s = data?.seriess?.[0];
  if (!s) throw new Error(data?.error_message || 'Unexpected response from FRED.');
  return `Connected — ${s.title} (last updated ${s.last_updated})`;
}

// ── ECB Data Portal ───────────────────────────────────────────────────────
export async function fetchEcb(flow, key, { frequency, start }) {
  const url = `https://data-api.ecb.europa.eu/service/data/${flow}/${key}?format=csvdata&detail=dataonly&startPeriod=${start}`;
  const csv = await fetchText(url, { timeoutMs: 30000 });
  const raw = parseCsv(csv).map((r) => ({ date: periodStart(r.TIME_PERIOD), value: toNumber(r.OBS_VALUE) }));
  return { frequency, points: normalizePoints(raw, frequency) };
}

export const ecbSeriesUrl = (flow, key) => `https://data.ecb.europa.eu/data/datasets/${flow}/${flow}.${key}`;

// ── Eurostat (JSON-stat 2.0) ──────────────────────────────────────────────
export async function fetchEurostat(dataset, filters, { frequency, sinceTimePeriod }) {
  const params = new URLSearchParams({ ...filters, sinceTimePeriod });
  const url = `https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/${dataset}?${params}`;
  const js = await fetchJson(url, { timeoutMs: 30000 });
  const timeIndex = js.dimension?.time?.category?.index ?? {};
  const raw = Object.entries(timeIndex).map(([period, idx]) => ({
    date: periodStart(period.replace(/^(\d{4})-?M(\d{2})$/, '$1-$2')),
    value: toNumber(js.value?.[idx]),
  }));
  return { frequency, points: normalizePoints(raw, frequency), updated: js.updated ?? null };
}

export const eurostatDatasetUrl = (dataset) => `https://ec.europa.eu/eurostat/databrowser/view/${dataset}/default/table?lang=en`;

// ── BIS ───────────────────────────────────────────────────────────────────
// One request covers every area. Returns { AREA: { frequency, points, sourceRef, title } }.
export async function fetchBis(dataflow, keyTemplate, areas, { frequency, start }) {
  const key = keyTemplate.replace('{AREAS}', areas.join('+'));
  const url = `https://stats.bis.org/api/v2/data/dataflow/BIS/${dataflow}/1.0/${key}?startPeriod=${start}&format=csv`;
  const csv = await fetchText(url, { timeoutMs: 45000 });
  const rows = parseCsv(csv);
  const out = {};
  for (const r of rows) {
    const area = r.REF_AREA;
    if (!area) continue;
    out[area] ??= { frequency, raw: [], sourceRef: r.SOURCE_REF || null, title: r.TITLE || r.TITLE_TS || null };
    out[area].raw.push({ date: periodStart(r.TIME_PERIOD), value: toNumber(r.OBS_VALUE) });
  }
  for (const area of Object.keys(out)) {
    out[area].points = normalizePoints(out[area].raw, frequency);
    delete out[area].raw;
  }
  return out;
}

export const bisSeriesUrl = (topic, dataflow, key) => `https://data.bis.org/topics/${topic}/BIS,${dataflow},1.0/${key}`;
