// Public identity in Community: profiles, usernames, presence, preferences.

import { prisma } from '../prisma.js';
import { mediaUrl, avatarUrl } from '../media.js';

export const STAFF_ROLES = ['moderator', 'admin', 'super_admin'];
export const isStaff = (u) => !!u && STAFF_ROLES.includes(u.role);

// Fields every public user card needs.
export const USER_CARD_SELECT = { id: true, name: true, username: true, headline: true, initials: true, role: true, avatarId: true, lastSeenAt: true, status: true };

// Nobody but Kotka staff may look like Kotka staff.
const RESERVED = /\b(kotka|admin|administrator|moderator|mod|support|official|staff|helpdesk|security|verified)\b/i;
const RESERVED_USERNAME = /(kotka|admin|moderator|support|official|staff|helpdesk|security|verified)/i;

export function validateUsername(raw, { staff = false } = {}) {
  const username = typeof raw === 'string' ? raw.trim().replace(/^@/, '').toLowerCase() : '';
  if (!/^[a-z0-9_]{3,20}$/.test(username)) return { error: 'Use 3 to 20 characters: letters, numbers and underscores.' };
  if (/^_|_$|__/.test(username)) return { error: "Usernames can't start or end with an underscore, or repeat them." };
  if (!staff && RESERVED_USERNAME.test(username)) return { error: 'That username is reserved.' };
  return { username };
}

// Display names and headlines: block impersonation of Kotka staff.
export function impersonationError(text, { staff = false } = {}) {
  if (staff || !text) return null;
  return RESERVED.test(text) ? 'Names and headlines cannot suggest you work for Kotka or moderate it.' : null;
}

export async function suggestUsername(name) {
  const base = (name || 'trader').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 14) || 'trader';
  const safe = RESERVED_USERNAME.test(base) ? 'trader' : base.length < 3 ? `${base}_fx` : base;
  for (let i = 0; i < 20; i++) {
    const candidate = i === 0 ? safe : `${safe}${Math.floor(Math.random() * 9000 + 100)}`;
    if (!(await prisma.user.findUnique({ where: { username: candidate }, select: { id: true } }))) return candidate;
  }
  return null;
}

export const ONLINE_WINDOW_MS = 150 * 1000;

export const DEFAULT_PREFS = {
  notify: { messages: true, mentions: true, replies: true, follows: true, activity: true, ideas: true, events: true, markets: true, news: true },
  // Which notifications also go to the phone/desktop as a push. Quieter by default.
  push: { messages: true, mentions: true, replies: true, follows: false, activity: false, ideas: true, events: true, markets: true, news: false, announcements: true },
  privacy: { showOnline: true, readReceipts: true, allowDmsFrom: 'everyone' }, // everyone | following | nobody
};

export function mergePrefs(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  return { notify: { ...DEFAULT_PREFS.notify, ...(r.notify ?? {}) }, push: { ...DEFAULT_PREFS.push, ...(r.push ?? {}) }, privacy: { ...DEFAULT_PREFS.privacy, ...(r.privacy ?? {}) } };
}

export async function loadPrefs(userId) {
  const s = await prisma.userSettings.findUnique({ where: { userId }, select: { communityPreferences: true } });
  return mergePrefs(s?.communityPreferences);
}

export async function prefsFor(userIds) {
  const rows = await prisma.userSettings.findMany({ where: { userId: { in: userIds } }, select: { userId: true, communityPreferences: true } });
  const map = new Map(rows.map((r) => [r.userId, mergePrefs(r.communityPreferences)]));
  return (id) => map.get(id) ?? mergePrefs(null);
}

// A user card as others see it. Presence only when the user allows it.
export function userCard(u, { showOnline = true } = {}) {
  if (!u) return { id: null, name: 'Deleted account', username: null, initials: '?', deleted: true };
  const online = showOnline && u.lastSeenAt && Date.now() - new Date(u.lastSeenAt).getTime() < ONLINE_WINDOW_MS;
  return {
    id: u.id,
    name: u.status === 'active' ? u.name : 'Unavailable account',
    username: u.username,
    headline: u.headline ?? null,
    initials: u.initials,
    avatarUrl: avatarUrl(u),
    staff: isStaff(u),
    online: !!online,
    lastSeenAt: showOnline ? u.lastSeenAt : null,
  };
}

// Batch-load user cards, honouring each user's online-status preference.
export async function userCards(ids) {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return new Map();
  const [users, prefOf] = await Promise.all([prisma.user.findMany({ where: { id: { in: unique } }, select: USER_CARD_SELECT }), prefsFor(unique)]);
  return new Map(users.map((u) => [u.id, userCard(u, { showOnline: prefOf(u.id).privacy.showOnline })]));
}

export async function touchPresence(userId) {
  await prisma.user.update({ where: { id: userId }, data: { lastSeenAt: new Date() }, select: { id: true } });
}

// Ids the viewer has blocked or muted, and ids who blocked the viewer.
export async function relationsFor(userId) {
  const rows = await prisma.userRelation.findMany({ where: { OR: [{ userId }, { targetId: userId, kind: 'block' }] }, select: { userId: true, targetId: true, kind: true } });
  const hidden = new Set();
  const blockedEitherWay = new Set();
  for (const r of rows) {
    if (r.userId === userId) {
      hidden.add(r.targetId);
      if (r.kind === 'block') blockedEitherWay.add(r.targetId);
    } else {
      blockedEitherWay.add(r.userId);
      hidden.add(r.userId);
    }
  }
  return { hidden, blockedEitherWay };
}

export { mediaUrl };
