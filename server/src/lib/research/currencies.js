// Currency registry: which official series feed each fundamental factor, and
// where each one comes from. Adding a currency or a better source is a
// config change here — the scoring engine reads roles, not providers.
//
// Source tiers follow the Kotka research hierarchy:
//   1 = IMF · 2 = central banks · 3 = national statistics offices
//   4 = BIS / World Bank / OECD · 5 = reputable press (not used for data)

import { fredSeriesUrl, ecbSeriesUrl, eurostatDatasetUrl, bisSeriesUrl } from './sources/timeseries.js';

export const FACTORS = [
  { key: 'monetary_policy', label: 'Monetary Policy', weight: 0.2 },
  { key: 'growth', label: 'Economic Growth', weight: 0.15 },
  { key: 'inflation', label: 'Inflation', weight: 0.12 },
  { key: 'imf_revisions', label: 'IMF Forecast Revisions', weight: 0.12 },
  { key: 'fiscal', label: 'Fiscal Position', weight: 0.1 },
  { key: 'external', label: 'External Position', weight: 0.1 },
  { key: 'financial_stability', label: 'Financial Stability', weight: 0.08 },
  { key: 'valuation', label: 'Currency Valuation', weight: 0.07 },
  { key: 'reserves', label: 'FX Reserves', weight: 0.06 },
];

// Reserve currencies: conventional reserve-adequacy analysis matters far less.
export const RESERVE_CURRENCY_RESERVES_WEIGHT = 0.03;

export const IMF_INDICATORS = {
  NGDP_RPCH: { label: 'Real GDP growth', unit: '%' },
  PCPIPCH: { label: 'Inflation, average consumer prices', unit: '%' },
  PCPIEPCH: { label: 'Inflation, end of period consumer prices', unit: '%' },
  BCA_NGDPD: { label: 'Current account balance', unit: '% of GDP' },
  GGXCNL_NGDP: { label: 'General government net lending/borrowing', unit: '% of GDP' },
  GGXONLB_NGDP: { label: 'General government primary net lending/borrowing', unit: '% of GDP' },
  GGXWDG_NGDP: { label: 'General government gross debt', unit: '% of GDP' },
  LUR: { label: 'Unemployment rate', unit: '%' },
};

const FED = { name: 'Board of Governors of the Federal Reserve System', tier: 2 };
const BLS = { name: 'U.S. Bureau of Labor Statistics', tier: 3 };
const BEA = { name: 'U.S. Bureau of Economic Analysis', tier: 3 };
const VIA_FRED = 'FRED, Federal Reserve Bank of St. Louis';

const fred = (id, frequency, extra = {}) => ({ provider: 'fred', id, frequency, url: fredSeriesUrl(id), ...extra });
const ecb = (flow, key, frequency, extra = {}) => ({ provider: 'ecb', flow, key, frequency, url: ecbSeriesUrl(flow, key), ...extra });
const bisPolicy = (area) => ({ provider: 'bis', dataflow: 'WS_CBPOL', keyTemplate: 'D.{AREAS}', area, frequency: 'D', compress: 'changes', url: bisSeriesUrl('CBPOL', 'WS_CBPOL', `D.${area}`) });
const bisCpi = (area) => ({ provider: 'bis', dataflow: 'WS_LONG_CPI', keyTemplate: 'M.{AREAS}.771', area, frequency: 'M', url: bisSeriesUrl('CPI', 'WS_LONG_CPI', `M.${area}.771`) });
const bisReer = (area) => ({ provider: 'bis', dataflow: 'WS_EER', keyTemplate: 'M.R.B.{AREAS}', area, frequency: 'M', history: 'long', url: bisSeriesUrl('EER', 'WS_EER', `M.R.B.${area}`) });
const ciss = (area) => ecb('CISS', `D.${area}.Z0Z.4F.EC.SS_CIN.IDX`, 'D', { market: true });

const BIS_SOURCE = { name: 'Bank for International Settlements', tier: 4 };

export const CURRENCIES = {
  USD: {
    code: 'USD',
    name: 'United States Dollar',
    economy: 'United States',
    imf: 'USA',
    bis: 'US',
    cofer: 'USD',
    reserveCurrency: true,
    centralBank: {
      name: 'Federal Reserve',
      short: 'Fed',
      target: 2,
      targetText: '2% inflation, measured by the annual change in the PCE price index',
      targetUrl: 'https://www.federalreserve.gov/faqs/economy_14400.htm',
      statement: 'fed',
      meetings: 'fomc',
    },
    releaseCalendars: ['bls', 'bea'],
    series: {
      policyUpper: { ...fred('DFEDTARU', 'D', { compress: 'changes' }), label: 'Federal funds target range — upper limit', unit: '%', source: FED, via: VIA_FRED, lagDays: 0 },
      policyLower: { ...fred('DFEDTARL', 'D', { compress: 'changes' }), label: 'Federal funds target range — lower limit', unit: '%', source: FED, via: VIA_FRED, lagDays: 0 },
      targetInflation: { ...fred('PCEPI', 'M', { transform: 'yoy' }), label: 'PCE price index inflation (y/y)', unit: '%', source: BEA, via: VIA_FRED, lagDays: 30 },
      coreInflation: { ...fred('PCEPILFE', 'M', { transform: 'yoy' }), label: 'Core PCE inflation, ex food & energy (y/y)', unit: '%', source: BEA, via: VIA_FRED, lagDays: 30 },
      headlineCpi: { ...fred('CPIAUCSL', 'M', { transform: 'yoy' }), label: 'CPI inflation, all items (y/y)', unit: '%', source: BLS, via: VIA_FRED, lagDays: 14 },
      coreCpi: { ...fred('CPILFESL', 'M', { transform: 'yoy' }), label: 'Core CPI inflation, ex food & energy (y/y)', unit: '%', source: BLS, via: VIA_FRED, lagDays: 14 },
      gdpYoY: { ...fred('A191RO1Q156NBEA', 'Q'), label: 'Real GDP growth (y/y)', unit: '%', source: BEA, via: VIA_FRED, lagDays: 30 },
      gdpQoQ: { ...fred('A191RL1Q225SBEA', 'Q'), label: 'Real GDP growth (q/q, seasonally adjusted annual rate)', unit: '%', source: BEA, via: VIA_FRED, lagDays: 30 },
      unemployment: { ...fred('UNRATE', 'M'), label: 'Unemployment rate', unit: '%', source: BLS, via: VIA_FRED, lagDays: 7 },
      yield2y: { ...fred('DGS2', 'D', { market: true }), label: '2-year Treasury yield (constant maturity)', unit: '%', source: FED, via: VIA_FRED, lagDays: 1 },
      stress: { ...ciss('US'), label: 'Composite Indicator of Systemic Stress (CISS), United States', unit: 'index (0–1)', source: { name: 'European Central Bank', tier: 2 }, lagDays: 3 },
      stressAlt: { ...fred('STLFSI4', 'W'), label: 'St. Louis Fed Financial Stress Index (0 = normal)', unit: 'index', source: { name: 'Federal Reserve Bank of St. Louis', tier: 2 }, via: VIA_FRED, lagDays: 7 },
      reer: { ...bisReer('US'), label: 'Real effective exchange rate, broad (2020 = 100)', unit: 'index', source: BIS_SOURCE, lagDays: 20 },
    },
  },
  EUR: {
    code: 'EUR',
    name: 'Euro',
    economy: 'Euro area',
    imf: 'G163',
    bis: 'XM',
    cofer: 'EUR',
    reserveCurrency: true,
    centralBank: {
      name: 'European Central Bank',
      short: 'ECB',
      target: 2,
      targetText: '2% inflation over the medium term (symmetric), measured by the HICP',
      targetUrl: 'https://www.ecb.europa.eu/mopo/strategy/html/index.en.html',
      statement: 'ecb',
      meetings: 'ecb',
    },
    releaseCalendars: ['eurostat'],
    series: {
      policyRate: { ...ecb('FM', 'D.U2.EUR.4F.KR.DFR.LEV', 'D', { compress: 'changes' }), label: 'ECB deposit facility rate', unit: '%', source: { name: 'European Central Bank', tier: 2 }, lagDays: 0 },
      targetInflation: { ...ecb('HICP', 'M.U2.N.000000.4D0.ANR', 'M'), label: 'HICP inflation, euro area (y/y)', unit: '%', source: { name: 'Eurostat', tier: 3 }, via: 'ECB Data Portal', lagDays: 3 },
      coreInflation: { ...ecb('HICP', 'M.U2.N.XEF000.4D0.ANR', 'M'), label: 'HICP inflation excl. energy & food (y/y)', unit: '%', source: { name: 'Eurostat', tier: 3 }, via: 'ECB Data Portal', lagDays: 3 },
      gdpYoY: { provider: 'eurostat', dataset: 'namq_10_gdp', filters: { geo: 'EA', unit: 'CLV_PCH_SM', s_adj: 'SCA', na_item: 'B1GQ' }, frequency: 'Q', url: eurostatDatasetUrl('namq_10_gdp'), label: 'Real GDP growth, euro area (y/y)', unit: '%', source: { name: 'Eurostat', tier: 3 }, lagDays: 30 },
      gdpQoQ: { provider: 'eurostat', dataset: 'namq_10_gdp', filters: { geo: 'EA', unit: 'CLV_PCH_PRE', s_adj: 'SCA', na_item: 'B1GQ' }, frequency: 'Q', url: eurostatDatasetUrl('namq_10_gdp'), label: 'Real GDP growth, euro area (q/q)', unit: '%', source: { name: 'Eurostat', tier: 3 }, lagDays: 30 },
      unemployment: { ...ecb('LFSI', 'M.I9.S.UNEHRT.TOTAL0.15_74.T', 'M'), label: 'Unemployment rate, euro area', unit: '%', source: { name: 'Eurostat', tier: 3 }, via: 'ECB Data Portal', lagDays: 32 },
      yield2y: { ...ecb('YC', 'B.U2.EUR.4F.G_N_A.SV_C_YM.SR_2Y', 'D', { market: true }), label: '2-year euro area government bond yield (all issuers, spot)', unit: '%', source: { name: 'European Central Bank', tier: 2 }, lagDays: 1 },
      stress: { ...ciss('U2'), label: 'Composite Indicator of Systemic Stress (CISS), euro area', unit: 'index (0–1)', source: { name: 'European Central Bank', tier: 2 }, lagDays: 3 },
      longRateIT: { ...ecb('IRS', 'M.IT.L.L40.CI.0000.EUR.N.Z', 'M'), label: 'Italy 10-year government bond yield', unit: '%', source: { name: 'European Central Bank', tier: 2 }, lagDays: 15 },
      longRateDE: { ...ecb('IRS', 'M.DE.L.L40.CI.0000.EUR.N.Z', 'M'), label: 'Germany 10-year government bond yield', unit: '%', source: { name: 'European Central Bank', tier: 2 }, lagDays: 15 },
      reer: { ...bisReer('XM'), label: 'Real effective exchange rate, broad (2020 = 100)', unit: 'index', source: BIS_SOURCE, lagDays: 20 },
    },
  },
  GBP: bisCurrency({
    code: 'GBP', name: 'British Pound', economy: 'United Kingdom', imf: 'GBR', bis: 'GB', cofer: 'GBP',
    centralBank: { name: 'Bank of England', short: 'BoE', target: 2, targetText: '2% CPI inflation', targetUrl: 'https://www.bankofengland.co.uk/monetary-policy/inflation' },
    extra: { stress: { ...ciss('GB'), label: 'Composite Indicator of Systemic Stress (CISS), United Kingdom', unit: 'index (0–1)', source: { name: 'European Central Bank', tier: 2 }, lagDays: 3 } },
  }),
  JPY: bisCurrency({
    code: 'JPY', name: 'Japanese Yen', economy: 'Japan', imf: 'JPN', bis: 'JP', cofer: 'JPY',
    centralBank: { name: 'Bank of Japan', short: 'BoJ', target: 2, targetText: '2% price stability target (CPI)', targetUrl: 'https://www.boj.or.jp/en/mopo/outline/index.htm' },
  }),
  CHF: bisCurrency({
    code: 'CHF', name: 'Swiss Franc', economy: 'Switzerland', imf: 'CHE', bis: 'CH', cofer: 'CHF',
    centralBank: { name: 'Swiss National Bank', short: 'SNB', target: [0, 2], targetText: 'Price stability, defined as CPI inflation of less than 2% (and no deflation)', targetUrl: 'https://www.snb.ch/en/the-snb/mandates-goals/monetary-policy/strategy' },
  }),
  CAD: bisCurrency({
    code: 'CAD', name: 'Canadian Dollar', economy: 'Canada', imf: 'CAN', bis: 'CA', cofer: 'CAD',
    centralBank: { name: 'Bank of Canada', short: 'BoC', target: 2, targetText: '2% CPI inflation, the midpoint of a 1–3% control range', targetUrl: 'https://www.bankofcanada.ca/rates/indicators/key-variables/inflation-control-target/' },
  }),
  AUD: bisCurrency({
    code: 'AUD', name: 'Australian Dollar', economy: 'Australia', imf: 'AUS', bis: 'AU', cofer: 'AUD',
    centralBank: { name: 'Reserve Bank of Australia', short: 'RBA', target: 2.5, targetText: '2–3% CPI inflation, targeting the 2.5% midpoint', targetUrl: 'https://www.rba.gov.au/monetary-policy/framework/' },
  }),
  NZD: bisCurrency({
    code: 'NZD', name: 'New Zealand Dollar', economy: 'New Zealand', imf: 'NZL', bis: 'NZ', cofer: null,
    centralBank: { name: 'Reserve Bank of New Zealand', short: 'RBNZ', target: 2, targetText: '1–3% CPI inflation over the medium term, focusing on the 2% midpoint', targetUrl: 'https://www.rbnz.govt.nz/monetary-policy' },
  }),
};

// Majors without a dedicated national adapter yet: IMF + BIS-compiled central
// bank data. Missing roles surface as DATA NOT AVAILABLE and reduce confidence.
function bisCurrency({ code, name, economy, imf, bis, cofer, centralBank, extra = {} }) {
  return {
    code,
    name,
    economy,
    imf,
    bis,
    cofer,
    reserveCurrency: !!cofer,
    centralBank: { ...centralBank, statement: null, meetings: null },
    releaseCalendars: [],
    series: {
      policyRate: { ...bisPolicy(bis), label: `${centralBank.name} policy rate`, unit: '%', source: BIS_SOURCE, compiledFrom: centralBank.name, lagDays: 1 },
      targetInflation: { ...bisCpi(bis), label: 'Consumer price inflation (y/y)', unit: '%', source: BIS_SOURCE, lagDays: 20 },
      reer: { ...bisReer(bis), label: 'Real effective exchange rate, broad (2020 = 100)', unit: 'index', source: BIS_SOURCE, lagDays: 20 },
      ...extra,
    },
  };
}

export const SUPPORTED_CURRENCY_CODES = Object.keys(CURRENCIES);

export const DEFAULT_PAIRS = ['EURUSD', 'GBPUSD', 'USDJPY', 'USDCHF', 'AUDUSD', 'USDCAD', 'NZDUSD', 'EURGBP', 'EURJPY', 'GBPJPY'];

export function parseSubject(subject) {
  const s = String(subject ?? '').toUpperCase().replace(/[^A-Z]/g, '');
  if (s.length === 3 && CURRENCIES[s]) return { kind: 'currency', subject: s, base: s };
  if (s.length === 6 && CURRENCIES[s.slice(0, 3)] && CURRENCIES[s.slice(3)] && s.slice(0, 3) !== s.slice(3)) {
    return { kind: 'pair', subject: s, base: s.slice(0, 3), quote: s.slice(3) };
  }
  return null;
}
