// Help requests to Kotka support. A trader opens a request (or reports a
// problem with a match they played), staff reply from Admin → Support, and
// each reply is emailed and shows in the app.

import { Router } from 'express';
import { waitUntil } from '@vercel/functions';
import { prisma } from '../lib/prisma.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { requireAuth } from '../middleware/auth.js';
import { limit } from '../lib/rateLimit.js';
import { auditLater } from '../lib/audit.js';
import { notify } from '../lib/community/notify.js';
import { sendEmail } from '../lib/email/send.js';
import { supportTicketEmail, supportReplyEmail } from '../lib/email/templates.js';
import { supportAddress } from '../lib/appSettings.js';

export const supportRouter = Router();
export const adminSupportRouter = Router();
supportRouter.use(requireAuth);

export const TOPICS = { account: 'My account', payments: 'Money in or out', game: 'Trading Game', match: 'A problem with a match', community: 'Community', ai: 'Kotka AI', bug: 'Something isn’t working', other: 'Something else' };
// A match can be reported for two weeks after it ends.
const MATCH_REPORT_DAYS = 14;
const clean = (v, max) => (typeof v === 'string' ? v.trim().replace(/\r\n/g, '\n').slice(0, max) : '');

const view = (t, { messages } = {}) => ({
  id: t.id,
  topic: t.topic,
  topicLabel: TOPICS[t.topic] ?? t.topic,
  subject: t.subject,
  status: t.status,
  matchId: t.matchId,
  createdAt: t.createdAt,
  lastMessageAt: t.lastMessageAt,
  ...(messages ? { messages: messages.map((m) => ({ id: m.id, fromStaff: m.fromStaff, body: m.body, createdAt: m.createdAt })) } : {}),
});

async function matchSummary(matchId) {
  if (!matchId) return null;
  const m = await prisma.gameMatch.findUnique({ where: { id: matchId }, select: { id: true, code: true, status: true, stakeKobo: true, settledAt: true, result: true, scenario: true, marketHash: true, generatorVersion: true } });
  return m ? { ...m, stakeKobo: Number(m.stakeKobo) } : null;
}

supportRouter.post('/tickets', limit('supportCreate'), asyncHandler(async (req, res) => {
  const topic = TOPICS[req.body?.topic] ? req.body.topic : 'other';
  const subject = clean(req.body?.subject, 120);
  const body = clean(req.body?.body, 5000);
  if (subject.length < 4) return res.status(400).json({ error: 'Give your request a short title.', field: 'subject' });
  if (body.length < 10) return res.status(400).json({ error: 'Tell us a little more, so we can help first time.', field: 'body' });
  let matchId = null;
  if (topic === 'match') {
    matchId = clean(req.body?.matchId, 40);
    const played = matchId ? await prisma.gamePlayer.findFirst({ where: { matchId, userId: req.userId }, select: { match: { select: { status: true, settledAt: true, updatedAt: true, mode: true } } } }) : null;
    if (!played) return res.status(400).json({ error: 'Choose a match you played.', field: 'matchId' });
    const ended = played.match.settledAt ?? played.match.updatedAt;
    if (Date.now() - new Date(ended).getTime() > MATCH_REPORT_DAYS * 86400e3) return res.status(400).json({ error: `Matches can be reported for ${MATCH_REPORT_DAYS} days after they end. For an older one, choose “Something else”.`, field: 'matchId' });
    const open = await prisma.supportTicket.findFirst({ where: { userId: req.userId, matchId, status: { not: 'closed' } }, select: { id: true } });
    if (open) return res.status(409).json({ error: 'You’ve already reported this match. Add to that request instead.', ticketId: open.id });
  }
  const me = await prisma.user.findUnique({ where: { id: req.userId }, select: { email: true, name: true } });
  const ticket = await prisma.supportTicket.create({ data: { userId: req.userId, email: me.email, topic, subject, matchId, messages: { create: { authorId: req.userId, body } } }, include: { messages: true } });
  auditLater(req, 'support.request_opened', { targetType: 'support', targetId: ticket.id, detail: { topic, matchId } });
  res.status(201).json({ ticket: view(ticket, { messages: ticket.messages }) });
  waitUntil((async () => {
    const to = await supportAddress();
    await sendEmail({ to, replyTo: me.email, ...supportTicketEmail({ ticket, name: me.name, body, topicLabel: TOPICS[topic] }) });
  })().catch((err) => console.error('Support email failed:', err.message)));
}));

supportRouter.get('/tickets', asyncHandler(async (req, res) => {
  const rows = await prisma.supportTicket.findMany({ where: { userId: req.userId }, orderBy: { lastMessageAt: 'desc' }, take: 50 });
  res.json({ tickets: rows.map((t) => view(t)), topics: TOPICS });
}));

async function mine(req, res) {
  const t = await prisma.supportTicket.findFirst({ where: { id: req.params.id, userId: req.userId }, include: { messages: { orderBy: { createdAt: 'asc' } } } });
  if (!t) res.status(404).json({ error: 'We couldn’t find that request.' });
  return t;
}

supportRouter.get('/tickets/:id', asyncHandler(async (req, res) => {
  const t = await mine(req, res);
  if (!t) return;
  res.json({ ticket: view(t, { messages: t.messages }) });
}));

supportRouter.post('/tickets/:id/messages', limit('supportReply'), asyncHandler(async (req, res) => {
  const t = await mine(req, res);
  if (!t) return;
  const body = clean(req.body?.body, 5000);
  if (body.length < 2) return res.status(400).json({ error: 'Write your message first.' });
  await prisma.supportMessage.create({ data: { ticketId: t.id, authorId: req.userId, body } });
  const updated = await prisma.supportTicket.update({ where: { id: t.id }, data: { status: 'open', lastMessageAt: new Date() }, include: { messages: { orderBy: { createdAt: 'asc' } } } });
  res.status(201).json({ ticket: view(updated, { messages: updated.messages }) });
  waitUntil((async () => {
    const to = await supportAddress();
    await sendEmail({ to, replyTo: t.email, ...supportTicketEmail({ ticket: updated, name: null, body, topicLabel: TOPICS[t.topic], followUp: true }) });
  })().catch((err) => console.error('Support email failed:', err.message)));
}));

supportRouter.post('/tickets/:id/close', asyncHandler(async (req, res) => {
  const t = await mine(req, res);
  if (!t) return;
  const updated = await prisma.supportTicket.update({ where: { id: t.id }, data: { status: 'closed' } });
  res.json({ ticket: view(updated) });
}));

// ── Staff ────────────────────────────────────────────────────────────────────

adminSupportRouter.get('/', asyncHandler(async (req, res) => {
  const status = ['open', 'answered', 'closed'].includes(req.query.status) ? req.query.status : 'open';
  const [rows, counts] = await Promise.all([
    prisma.supportTicket.findMany({ where: { status }, orderBy: { lastMessageAt: status === 'open' ? 'asc' : 'desc' }, take: 100, include: { user: { select: { id: true, name: true, username: true } } } }),
    prisma.supportTicket.groupBy({ by: ['status'], _count: { _all: true } }),
  ]);
  res.json({ tickets: rows.map((t) => ({ ...view(t), user: t.user, email: t.email })), counts: Object.fromEntries(counts.map((c) => [c.status, c._count._all])) });
}));

adminSupportRouter.get('/:id', asyncHandler(async (req, res) => {
  const t = await prisma.supportTicket.findUnique({ where: { id: req.params.id }, include: { messages: { orderBy: { createdAt: 'asc' } }, user: { select: { id: true, name: true, username: true, email: true, status: true, createdAt: true } } } });
  if (!t) return res.status(404).json({ error: 'We couldn’t find that request.' });
  res.json({ ticket: { ...view(t, { messages: t.messages }), user: t.user, email: t.email, match: await matchSummary(t.matchId) } });
}));

adminSupportRouter.post('/:id/messages', limit('supportReply'), asyncHandler(async (req, res) => {
  const t = await prisma.supportTicket.findUnique({ where: { id: req.params.id } });
  if (!t) return res.status(404).json({ error: 'We couldn’t find that request.' });
  const body = clean(req.body?.body, 5000);
  if (body.length < 2) return res.status(400).json({ error: 'Write your reply first.' });
  await prisma.supportMessage.create({ data: { ticketId: t.id, authorId: req.user.id, fromStaff: true, body } });
  const updated = await prisma.supportTicket.update({ where: { id: t.id }, data: { status: req.body?.close === true ? 'closed' : 'answered', lastMessageAt: new Date(), assignedTo: t.assignedTo ?? req.user.id } });
  auditLater(req, 'support.replied', { targetType: 'support', targetId: t.id, detail: { closed: req.body?.close === true } });
  res.status(201).json({ ok: true, status: updated.status });
  waitUntil((async () => {
    if (t.userId) await notify([{ userId: t.userId, type: 'support', title: 'Kotka support replied', body: t.subject, link: `/app/support/${t.id}` }]);
    await sendEmail({ to: t.email, replyTo: await supportAddress(), ...supportReplyEmail({ subject: t.subject, body, ticketId: t.id }) });
  })().catch((err) => console.error('Support reply delivery failed:', err.message)));
}));

adminSupportRouter.patch('/:id', asyncHandler(async (req, res) => {
  const status = req.body?.status;
  if (!['open', 'answered', 'closed'].includes(status)) return res.status(400).json({ error: 'Choose open, answered or closed.' });
  const t = await prisma.supportTicket.update({ where: { id: req.params.id }, data: { status } }).catch(() => null);
  if (!t) return res.status(404).json({ error: 'We couldn’t find that request.' });
  auditLater(req, 'support.status_changed', { targetType: 'support', targetId: t.id, detail: { status } });
  res.json({ ticket: view(t) });
}));
