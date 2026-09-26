// Market events, synced from the publishers' own calendars (Fed, ECB, BLS,
// BEA, Eurostat) into MarketEvent rows so each can have a page and a room.
// Previous / forecast / actual are not published by these calendars; they
// stay empty unless an admin fills them in from a named source.

import { prisma } from '../prisma.js';
import { cachedSource, peekSource, HOUR } from '../research/cache.js';
import { CALENDAR_SOURCES, fetchFomcMeetings, fetchEcbMeetings, fetchBlsReleases, fetchBeaReleases, fetchEurostatReleases } from '../research/sources/calendars.js';
import { instrumentsForCurrency, instrument } from '../instruments.js';
import { dailyBarsKey } from '../massive.js';

const COUNTRY = { USD: 'United States', EUR: 'Euro area' };
const CALENDARS = [
  { key: 'fomc', currency: 'USD', category: 'policy', fetch: fetchFomcMeetings },
  { key: 'bls', currency: 'USD', fetch: fetchBlsReleases },
  { key: 'bea', currency: 'USD', fetch: fetchBeaReleases },
  { key: 'ecb', currency: 'EUR', category: 'policy', fetch: fetchEcbMeetings },
  { key: 'eurostat', currency: 'EUR', fetch: null },
];

export async function syncEvents() {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const horizonEnd = new Date(now.getTime() + 60 * 24 * HOUR);
  let upserts = 0;
  for (const c of CALENDARS) {
    const fetcher = c.key === 'eurostat' ? () => fetchEurostatReleases(new Date(now.getTime() - 7 * 24 * HOUR), horizonEnd) : c.fetch;
    let events = [];
    try {
      ({ data: events } = await cachedSource(`calendar:${c.key}:${today}`, 12 * HOUR, fetcher));
    } catch (err) {
      console.error(`Event sync: ${c.key} failed:`, err.message);
      continue;
    }
    for (const e of events ?? []) {
      const at = new Date(e.date);
      if (Number.isNaN(at.getTime()) || at < new Date(now.getTime() - 30 * 24 * HOUR) || at > horizonEnd) continue;
      const rawTitle = (e.event ?? e.label ?? '').trim();
      const title = rawTitle.replace(/\s*[—–]\s*/g, ': ');
      if (!title) continue;
      // Keyed on the publisher's original title so re-syncs update, not duplicate.
      const sourceKey = `${c.key}:${at.toISOString().slice(0, 10)}:${rawTitle}`.slice(0, 250);
      const data = {
        source: c.key,
        title,
        currency: c.currency,
        country: COUNTRY[c.currency],
        category: e.category ?? c.category ?? 'other',
        importance: e.importance ?? 'High',
        scheduledAt: at,
        dateOnly: !!e.dateOnly,
        referencePeriod: e.referencePeriod ?? null,
        sourceName: CALENDAR_SOURCES[c.key].name.replace(/\s*[—–]\s*/g, ': '),
        sourceUrl: CALENDAR_SOURCES[c.key].url,
        instruments: instrumentsForCurrency(c.currency),
      };
      await prisma.marketEvent.upsert({ where: { sourceKey }, update: { scheduledAt: data.scheduledAt, dateOnly: data.dateOnly, importance: data.importance, referencePeriod: data.referencePeriod }, create: { sourceKey, ...data } });
      upserts += 1;
    }
  }
  return { upserts };
}

// At most every 6 hours, shared across instances.
export async function ensureEventsSynced() {
  const { data } = await cachedSource('community:events:sync', 6 * HOUR, async () => ({ at: new Date().toISOString(), ...(await syncEvents()) }));
  return data;
}

// How related instruments closed on the event's date (end-of-day bars,
// cache only). Only after the date has passed.
export async function eventReaction(event) {
  const day = new Date(event.scheduledAt).toISOString().slice(0, 10);
  if (new Date(`${day}T23:59:59Z`) > new Date()) return [];
  const out = [];
  for (const sym of (event.instruments ?? []).slice(0, 10)) {
    const inst = instrument(sym);
    if (!inst?.ticker) continue;
    let bars = null;
    for (let back = 0; back < 4 && !bars; back++) {
      const hit = await peekSource(dailyBarsKey(inst.ticker, new Date(Date.now() - back * 86400000)));
      if (hit?.data?.length) bars = hit.data;
    }
    if (!bars) continue;
    const idx = bars.findIndex((b) => new Date(b.t).toISOString().slice(0, 10) === day);
    if (idx < 1) continue;
    const b = bars[idx];
    const prev = bars[idx - 1];
    out.push({ symbol: sym, display: inst.display, date: day, open: b.o, close: b.c, high: b.h, low: b.l, changePct: Math.round((b.c / prev.c - 1) * 10000) / 100, rangePct: Math.round(((b.h - b.l) / prev.c) * 10000) / 100, decimals: inst.decimals });
  }
  return out;
}
