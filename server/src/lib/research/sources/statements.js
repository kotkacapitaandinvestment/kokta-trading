// Latest official monetary-policy statements, fetched from the central banks'
// own websites. The text is kept verbatim so anything Kotka shows as a
// quotation can be checked against it.

import { fetchText, htmlToText, decodeEntities } from '../http.js';

function splitSentences(text) {
  return text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+(?=[A-Z“"(])/)
    .map((s) => s.trim())
    .filter((s) => s.length > 20 && s.length < 600);
}

const DECISION = /\b(decided|decision|raise|raised|lower|lowered|reduce|cut|maintain|unchanged|basis points?|percentage point|target range)\b/i;
const INFLATION = /\binflation\b/i;
const GUIDANCE = /\b(goal|target|price stability|data[- ]dependent|meeting[- ]by[- ]meeting|pre-?commit|additional adjustments|appropriate|will (?:continue|remain|follow|deliver|support|assess)|outlook|risks?|uncertain)/i;

// Deterministic, verbatim key-sentence extraction (no model involved).
export function keySentences(text, max = 4) {
  const sentences = splitSentences(text);
  const scored = sentences.map((s, i) => {
    let score = 0;
    if (DECISION.test(s)) score += 3;
    if (INFLATION.test(s)) score += 2;
    if (GUIDANCE.test(s)) score += 2;
    if (/media|contact|voting for|press release|reproduction/i.test(s)) score -= 10;
    return { s, i, score };
  });
  const firstDecision = scored.find((x) => DECISION.test(x.s) && x.score > 0);
  const top = scored
    .filter((x) => x.score >= 2 && x !== firstDecision)
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .slice(0, max - (firstDecision ? 1 : 0));
  return [firstDecision, ...top].filter(Boolean).sort((a, b) => a.i - b.i).map((x) => x.s);
}

// ── Federal Reserve ───────────────────────────────────────────────────────
export async function fetchLatestFomcStatement() {
  const rss = await fetchText('https://www.federalreserve.gov/feeds/press_monetary.xml', { timeoutMs: 20000 });
  const items = [...rss.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((m) => {
    const block = m[1];
    const pick = (tag) => block.match(new RegExp(`<${tag}>\\s*(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?\\s*</${tag}>`))?.[1]?.trim();
    return { title: decodeEntities(pick('title') ?? ''), link: pick('link'), pubDate: pick('pubDate') };
  });
  const item = items.find((i) => /issues FOMC statement/i.test(i.title));
  if (!item?.link) throw new Error('No FOMC statement found in the Federal Reserve monetary policy feed.');

  const html = await fetchText(item.link, { timeoutMs: 20000 });
  const paragraphs = [...html.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)].map((m) => htmlToText(m[1]).replace(/\s+/g, ' ').trim()).filter(Boolean);
  const start = paragraphs.findIndex((p) => /approved the following statement|The Committee decided|Recent indicators|Available indicators/i.test(p));
  const end = paragraphs.findIndex((p, i) => i > start && /^(Voting for|For media inquiries|Implementation Note)/i.test(p));
  const body = paragraphs.slice(start >= 0 ? start : 0, end > start ? end : undefined).filter((p) => !/approved the following statement/i.test(p));
  if (!body.length) throw new Error('Could not extract the FOMC statement text.');

  const text = body.join('\n\n');
  return {
    institution: 'Federal Reserve',
    title: 'FOMC statement',
    url: item.link,
    publishedAt: item.pubDate ? new Date(item.pubDate).toISOString() : null,
    text,
  };
}

// ── European Central Bank ─────────────────────────────────────────────────
export async function fetchLatestEcbDecision(now = new Date()) {
  let entry = null;
  for (const year of [now.getUTCFullYear(), now.getUTCFullYear() - 1]) {
    try {
      const inc = await fetchText(`https://www.ecb.europa.eu/press/govcdec/mopo/${year}/html/index_include.en.html`, { timeoutMs: 20000 });
      const m = inc.match(/<dt isoDate="(\d{4}-\d{2}-\d{2})"[\s\S]*?<a href="([^"]+\.en\.html)"[^>]*>\s*([^<]+?)\s*<\/a>/);
      if (m) {
        entry = { date: m[1], url: `https://www.ecb.europa.eu${m[2]}`, title: decodeEntities(m[3]) };
        break;
      }
    } catch {
      // try previous year
    }
  }
  if (!entry) throw new Error('No ECB monetary policy decision found.');

  const html = await fetchText(entry.url, { timeoutMs: 20000 });
  const main = html.match(/<main[\s\S]*?<\/main>/i)?.[0] ?? html;
  const paragraphs = [...main.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)].map((m) => htmlToText(m[1]).replace(/\s+/g, ' ').trim()).filter(Boolean);
  const start = paragraphs.findIndex((p) => /^The Governing Council (today )?decided|^The Governing Council/i.test(p));
  const end = paragraphs.findIndex((p, i) => i > start && /^(\*\*\*|For media queries|Media contacts|Reproduction is permitted|The President of the ECB will comment)/i.test(p));
  const body = paragraphs.slice(start >= 0 ? start : 0, end > start ? end : undefined);
  if (!body.length) throw new Error('Could not extract the ECB decision text.');

  const text = body.join('\n\n');
  return {
    institution: 'European Central Bank',
    title: entry.title,
    url: entry.url,
    publishedAt: new Date(`${entry.date}T12:00:00Z`).toISOString(),
    publishedDateOnly: true,
    text,
  };
}

export const STATEMENT_FETCHERS = {
  fed: fetchLatestFomcStatement,
  ecb: fetchLatestEcbDecision,
};
