// Official event calendars used for "Upcoming catalysts". Every date comes
// from the publishing institution's own schedule — none are estimated.

import { fetchText, fetchJson, decodeEntities } from '../http.js';

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

export const CALENDAR_SOURCES = {
  fomc: { name: 'Federal Reserve — FOMC meeting calendar', url: 'https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm', tier: 2 },
  ecb: { name: 'ECB — Governing Council meeting calendar', url: 'https://www.ecb.europa.eu/press/calendars/mgcgc/html/index.en.html', tier: 2 },
  bls: { name: 'U.S. Bureau of Labor Statistics — release schedule', url: 'https://www.bls.gov/schedule/news_release/', tier: 3 },
  bea: { name: 'U.S. Bureau of Economic Analysis — release schedule', url: 'https://www.bea.gov/news/schedule', tier: 3 },
  eurostat: { name: 'Eurostat — euro indicators release calendar', url: 'https://ec.europa.eu/eurostat/news/release-calendar', tier: 3 },
};

// US Eastern local time -> UTC (DST: second Sunday of March to first Sunday of November).
function easternToUtc(y, mo, d, h, mi) {
  const nthSunday = (month, n) => {
    const first = new Date(Date.UTC(y, month, 1)).getUTCDay();
    return 1 + ((7 - first) % 7) + (n - 1) * 7;
  };
  const dstStart = Date.UTC(y, 2, nthSunday(2, 2), 7);
  const dstEnd = Date.UTC(y, 10, nthSunday(10, 1), 6);
  const asUtc = Date.UTC(y, mo, d, h, mi);
  const offset = asUtc + 5 * 3600000 >= dstStart && asUtc + 4 * 3600000 < dstEnd ? 4 : 5;
  return new Date(asUtc + offset * 3600000);
}

export async function fetchFomcMeetings() {
  const html = await fetchText(CALENDAR_SOURCES.fomc.url, { timeoutMs: 20000 });
  const parts = html.split(/(\d{4}) FOMC Meetings/);
  const meetings = [];
  for (let i = 1; i < parts.length; i += 2) {
    const year = Number(parts[i]);
    const chunk = parts[i + 1];
    const tokens = [...chunk.matchAll(/fomc-meeting__month[^>]*>\s*<strong>([^<]+)<\/strong>|fomc-meeting__date[^>]*>([^<]+)</g)];
    let month = null;
    for (const t of tokens) {
      if (t[1]) {
        month = t[1].trim();
        continue;
      }
      if (!month || !t[2]) continue;
      const raw = t[2].trim();
      if (/notation|unscheduled|conference call/i.test(raw)) continue;
      const days = raw.match(/\d+/g);
      if (!days) continue;
      const lastMonthName = month.split('/').pop().toLowerCase();
      const mIdx = MONTHS.findIndex((m) => m.startsWith(lastMonthName.slice(0, 3)));
      if (mIdx < 0) continue;
      const day = Number(days[days.length - 1]);
      meetings.push({
        // The calendar publishes dates only, so the time is not asserted (dateOnly).
        date: new Date(Date.UTC(year, mIdx, day, 12, 0)).toISOString(),
        dateOnly: true,
        label: `FOMC monetary policy decision (${month} ${raw.replace('*', '').trim()} meeting)`,
        withProjections: raw.includes('*'),
      });
      month = null;
    }
  }
  return meetings.sort((a, b) => a.date.localeCompare(b.date));
}

export async function fetchEcbMeetings() {
  const html = await fetchText(CALENDAR_SOURCES.ecb.url, { timeoutMs: 20000 });
  const out = [];
  for (const m of html.matchAll(/<dt>\s*(\d{2})\/(\d{2})\/(\d{4})\s*<\/dt>\s*<dd>([\s\S]*?)<\/dd>/g)) {
    const text = decodeEntities(m[4].replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
    if (!/monetary policy meeting/i.test(text) || /non-monetary/i.test(text)) continue;
    if (!/day 2|press conference/i.test(text)) continue;
    out.push({
      date: new Date(Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1]), 12, 0)).toISOString(),
      dateOnly: true,
      label: 'ECB monetary policy decision (Governing Council, followed by press conference)',
    });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

function parseIcs(text) {
  const unfolded = text.replace(/\r/g, '').replace(/\n[ \t]/g, '');
  return unfolded
    .split('BEGIN:VEVENT')
    .slice(1)
    .map((block) => {
      const summary = block.match(/\nSUMMARY[^:]*:(.*)/)?.[1]?.replace(/\\,/g, ',').replace(/\\;/g, ';').trim();
      const dt = block.match(/\nDTSTART([^:]*):(\d{8}T?\d{0,6}Z?)/);
      return { summary, dtParams: dt?.[1] ?? '', dt: dt?.[2] ?? null };
    })
    .filter((e) => e.summary && e.dt);
}

function icsDate(e) {
  const m = e.dt.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2}))?/);
  if (!m) return null;
  const [, y, mo, d, h = '12', mi = '00'] = m;
  if (e.dt.endsWith('Z')) return new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi));
  return easternToUtc(+y, +mo - 1, +d, +h, +mi);
}

const BLS_EVENTS = [
  { match: /^Employment Situation/i, event: 'US Employment Situation (nonfarm payrolls, unemployment rate)', category: 'labour', importance: 'High' },
  { match: /^Consumer Price Index/i, event: 'US Consumer Price Index (CPI)', category: 'inflation', importance: 'High' },
  { match: /^Producer Price Index/i, event: 'US Producer Price Index (PPI)', category: 'inflation', importance: 'Medium' },
  { match: /^Job Openings and Labor Turnover/i, event: 'US Job Openings and Labor Turnover (JOLTS)', category: 'labour', importance: 'Medium' },
];

const BEA_EVENTS = [
  { match: /^GDP \(/i, event: 'US GDP', category: 'growth', importance: 'High' },
  { match: /^Personal Income and Outlays/i, event: 'US Personal Income and Outlays (PCE inflation — the Fed’s target measure)', category: 'inflation', importance: 'High' },
  { match: /^U\.S\. International Trade in Goods and Services/i, event: 'US international trade in goods and services', category: 'external', importance: 'Medium' },
  { match: /^U\.S\. International Transactions/i, event: 'US international transactions (current account)', category: 'external', importance: 'Medium' },
];

export async function fetchBlsReleases() {
  const text = await fetchText('https://www.bls.gov/schedule/news_release/bls.ics', { timeoutMs: 20000 });
  return parseIcs(text).flatMap((e) => {
    const def = BLS_EVENTS.find((d) => d.match.test(e.summary));
    const date = icsDate(e);
    return def && date ? [{ date: date.toISOString(), event: def.event, category: def.category, importance: def.importance, referencePeriod: null }] : [];
  });
}

export async function fetchBeaReleases() {
  const text = await fetchText('https://www.bea.gov/news/schedule/ics', { timeoutMs: 20000 });
  return parseIcs(text).flatMap((e) => {
    const def = BEA_EVENTS.find((d) => d.match.test(e.summary));
    const date = icsDate(e);
    if (!def || !date) return [];
    const q = e.summary.match(/(\d)(?:st|nd|rd|th) Quarter (\d{4})/i);
    const ref = q ? `Q${q[1]} ${q[2]}` : e.summary.split(',').slice(1).join(',').trim() || null;
    const label = def.category === 'growth' ? `${def.event} — ${e.summary.match(/\(([^)]+)\)/)?.[1] ?? ''}`.trim() : def.event;
    return [{ date: date.toISOString(), event: label, category: def.category, importance: def.importance, referencePeriod: ref }];
  });
}

const EUROSTAT_EVENTS = [
  { match: /^Flash estimate inflation euro area/i, event: 'Euro area HICP flash estimate', category: 'inflation', importance: 'High' },
  { match: /^Inflation \(HICP\)/i, event: 'Euro area HICP (final)', category: 'inflation', importance: 'Medium' },
  { match: /^(Preliminary flash estimate GDP|Flash estimate GDP)/i, event: 'Euro area GDP flash estimate', category: 'growth', importance: 'High' },
  { match: /^GDP main aggregates/i, event: 'Euro area GDP and employment (update)', category: 'growth', importance: 'Medium' },
  { match: /^Unemployment$/i, event: 'Euro area unemployment', category: 'labour', importance: 'Medium' },
  { match: /^General government deficit and debt/i, event: 'Euro area government deficit and debt', category: 'fiscal', importance: 'Medium' },
  { match: /^Balance of payments/i, event: 'EU balance of payments (current account)', category: 'external', importance: 'Medium' },
];

export async function fetchEurostatReleases(from, to) {
  const params = new URLSearchParams({ start: from.toISOString(), end: to.toISOString(), isEuroindicator: 'true' });
  const list = await fetchJson(`https://ec.europa.eu/eurostat/o/calendars/eventsJson?${params}`, { timeoutMs: 20000 });
  return (Array.isArray(list) ? list : []).flatMap((e) => {
    const def = EUROSTAT_EVENTS.find((d) => d.match.test(e.title ?? ''));
    return def && e.start ? [{ date: new Date(e.start).toISOString(), event: def.event, category: def.category, importance: def.importance, referencePeriod: e.period ?? null }] : [];
  });
}
