// IMF data via the official SDMX 2.1 API (api.imf.org). Tier 1 source.
//  - World Economic Outlook: the current dataset plus archived vintages
//    (e.g. WEO_2025_OCT_VINTAGE), which is what makes real forecast-revision
//    comparisons possible.
//  - COFER: currency composition of official foreign-exchange reserves.

import { fetchText, toNumber } from '../http.js';

const SDMX = 'https://api.imf.org/external/sdmx/2.1';
export const WEO_DATASET_URL = 'https://data.imf.org/en/datasets/IMF.RES:WEO';
export const COFER_DATASET_URL = 'https://data.imf.org/en/datasets/IMF.STA:COFER';

const MONTHS = { JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5, JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11 };
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function attrs(tag) {
  const out = {};
  for (const [, k, v] of tag.matchAll(/([A-Za-z_:]+)="([^"]*)"/g)) out[k] = v;
  return out;
}

// Lists the current WEO dataflow and every archived WEO vintage the IMF exposes.
export async function listWeoDataflows() {
  const xml = await fetchText(`${SDMX}/dataflow/IMF.RES/all/latest`, { timeoutMs: 30000 });
  const flows = [];
  for (const m of xml.matchAll(/<str:Dataflow\b[^>]*>/g)) {
    const a = attrs(m[0]);
    if (a.id === 'WEO') {
      flows.push({ id: a.id, version: a.version, vintageDate: null });
      continue;
    }
    const v = a.id?.match(/^WEO_(\d{4})_([A-Z]{3})_VINTAGE$/);
    if (v && MONTHS[v[2]] !== undefined) {
      flows.push({ id: a.id, version: a.version, vintageDate: new Date(Date.UTC(Number(v[1]), MONTHS[v[2]], 1)).toISOString() });
    }
  }
  return flows;
}

export function vintageLabel(isoDate) {
  if (!isoDate) return 'Unknown vintage';
  const d = new Date(isoDate);
  return `${MONTH_NAMES[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

// Returns { dataflow, version, publicationDate, updateDate, series: { COUNTRY: { INDICATOR: { latestActual, values: { year: value } } } } }
export async function fetchWeo({ dataflow, version, countries, indicators, startYear, endYear }) {
  const key = `${countries.join('+')}.${indicators.join('+')}.A`;
  const url = `${SDMX}/data/IMF.RES,${dataflow},${version}/${key}?startPeriod=${startYear}&endPeriod=${endYear}`;
  const xml = await fetchText(url, { timeoutMs: 45000 });

  const dataSetTag = xml.match(/<message:DataSet\b[^>]*>/)?.[0];
  const ds = dataSetTag ? attrs(dataSetTag) : {};

  const series = {};
  const ensure = (c, i) => {
    series[c] ??= {};
    series[c][i] ??= { latestActual: null, values: {} };
    return series[c][i];
  };

  for (const m of xml.matchAll(/<Group\b[^>]*>/g)) {
    const a = attrs(m[0]);
    if (a.COUNTRY && a.INDICATOR && a.LATEST_ACTUAL_ANNUAL_DATA) {
      ensure(a.COUNTRY, a.INDICATOR).latestActual = Number(a.LATEST_ACTUAL_ANNUAL_DATA) || null;
    }
  }

  for (const m of xml.matchAll(/<Series\b([^>]*)>([\s\S]*?)<\/Series>/g)) {
    const a = attrs(`<Series ${m[1]}>`);
    if (!a.COUNTRY || !a.INDICATOR) continue;
    const s = ensure(a.COUNTRY, a.INDICATOR);
    for (const o of m[2].matchAll(/<Obs\b[^>]*>/g)) {
      const oa = attrs(o[0]);
      const v = toNumber(oa.OBS_VALUE);
      if (oa.TIME_PERIOD && v !== null) s.values[oa.TIME_PERIOD] = Math.round(v * 1000) / 1000;
    }
  }

  return {
    dataflow,
    version,
    publicationDate: ds.PUBLICATION_DATE ?? null,
    updateDate: ds.UPDATE_DATE ?? null,
    series,
  };
}

// Share of each currency in allocated global FX reserves (percent), quarterly.
export async function fetchCofer({ currencies, startPeriod }) {
  const codes = currencies.map((c) => `CI_${c}`).join('+');
  const url = `${SDMX}/data/IMF.STA,COFER/G001.AFXRA.${codes}.SHRO_PT.Q?startPeriod=${startPeriod}`;
  const xml = await fetchText(url, { timeoutMs: 45000 });
  const out = {};
  for (const m of xml.matchAll(/<Series\b([^>]*)>([\s\S]*?)<\/Series>/g)) {
    const a = attrs(`<Series ${m[1]}>`);
    const ccy = a.FXR_CURRENCY?.replace(/^CI_/, '');
    if (!ccy) continue;
    out[ccy] = [...m[2].matchAll(/<Obs\b[^>]*>/g)]
      .map((o) => attrs(o[0]))
      .map((oa) => ({ period: oa.TIME_PERIOD, value: toNumber(oa.OBS_VALUE) }))
      .filter((p) => p.period && p.value !== null)
      .sort((x, y) => x.period.localeCompare(y.period));
  }
  return out;
}
