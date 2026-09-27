// Per-user write limits, counted from the database so they hold across
// serverless instances. Generous for real conversation, tight for spam.
import { prisma } from '../prisma.js';

const LIMITS = {
  message: { windowMs: 60 * 1000, max: 30, count: (userId, since) => prisma.message.count({ where: { authorId: userId, createdAt: { gte: since } } }) },
  post: { windowMs: 60 * 60 * 1000, max: 20, count: (userId, since) => prisma.post.count({ where: { authorId: userId, createdAt: { gte: since } } }) },
  comment: { windowMs: 10 * 60 * 1000, max: 40, count: (userId, since) => prisma.comment.count({ where: { authorId: userId, createdAt: { gte: since } } }) },
  media: { windowMs: 60 * 60 * 1000, max: 60, count: (userId, since) => prisma.media.count({ where: { ownerId: userId, createdAt: { gte: since } } }) },
  report: { windowMs: 24 * 60 * 60 * 1000, max: 30, count: (userId, since) => prisma.report.count({ where: { reporterId: userId, createdAt: { gte: since } } }) },
  conversation: { windowMs: 60 * 60 * 1000, max: 30, count: (userId, since) => prisma.conversation.count({ where: { createdById: userId, createdAt: { gte: since } } }) },
  share: { windowMs: 24 * 60 * 60 * 1000, max: 40, count: (userId, since) => prisma.achievementShare.count({ where: { userId, createdAt: { gte: since } } }) },
};

// Returns an error message when over the limit, else null.
export async function overLimit(kind, userId) {
  const l = LIMITS[kind];
  const n = await l.count(userId, new Date(Date.now() - l.windowMs));
  if (n < l.max) return null;
  const mins = Math.round(l.windowMs / 60000);
  return `You're posting too quickly. Please wait a little (limit: ${l.max} per ${mins >= 60 ? `${mins / 60} hour${mins >= 120 ? 's' : ''}` : `${mins} minute${mins > 1 ? 's' : ''}`}).`;
}
