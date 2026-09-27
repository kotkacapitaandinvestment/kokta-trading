// Client mirror of server/src/lib/goals/cards.js publicSnapshot(): what a
// card shows for a chosen set of fields. The server rebuilds and enforces
// the same thing when a public link is created.
import { Award, BookOpen, CalendarCheck, Flame, History, Lock, Medal, Route, ShieldCheck, Target, TrendingUp, Trophy } from 'lucide-react';

export const ICONS = { trophy: Trophy, flame: Flame, shield: ShieldCheck, medal: Medal, book: BookOpen, calendar: CalendarCheck, history: History, target: Target, lock: Lock, award: Award, trending: TrendingUp, route: Route };

export const FORMATS = [
  { id: '1:1', label: 'Square', hint: 'Instagram, LinkedIn, Facebook', width: 1080, height: 1080 },
  { id: '9:16', label: 'Story', hint: 'Instagram Story, WhatsApp Status', width: 1080, height: 1920 },
  { id: '16:9', label: 'Wide', hint: 'X and social feeds', width: 1600, height: 900 },
  { id: '4:5', label: 'Portrait', hint: 'Profile card, Instagram feed', width: 1080, height: 1350 },
];

const IDENTITY = ['name', 'username'];
const firstName = (name) => String(name ?? '').trim().split(/\s+/)[0] || null;

export const presetKeys = (card) => card.fields.filter((f) => !f.sensitive && f.on).map((f) => f.key);

export function snapshotFor(card, keys) {
  const chosen = new Set(keys);
  const name = chosen.has('name') ? card.identity?.name : null;
  const username = chosen.has('username') ? card.identity?.username : null;
  const who = firstName(name) ?? (username ? `@${username}` : 'A Kotka trader');
  return {
    source: card.source,
    type: card.type,
    eyebrow: card.eyebrow,
    icon: card.icon,
    headline: chosen.has('goalTitle') && card.headlineSensitive ? card.headlineSensitive : card.headlineGeneric && !chosen.has('goalName') ? card.headlineGeneric : card.headline,
    subline: card.subline ?? null,
    sentence: card.sentence.replace('{who}', who),
    date: card.date,
    verification: card.verification === 'verified' ? 'verified' : 'self_reported',
    motto: card.motto,
    fields: card.fields.filter((f) => chosen.has(f.key) && !IDENTITY.includes(f.key) && !['goalTitle', 'goalName'].includes(f.key)),
    identity: { name, username },
  };
}

// Local calendar date: check-ins and streaks follow the trader's day.
export function localToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export const formatDay = (iso, opts = { day: 'numeric', month: 'long', year: 'numeric' }) => new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString('en-GB', opts);
