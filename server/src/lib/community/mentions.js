import { prisma } from '../prisma.js';

// @username mentions -> user ids (active accounts only), max 10 per text.
export async function resolveMentions(text) {
  const names = [...new Set([...String(text ?? '').matchAll(/(?:^|[^\w@])@([a-z0-9_]{3,20})\b/gi)].map((m) => m[1].toLowerCase()))].slice(0, 10);
  if (!names.length) return [];
  const users = await prisma.user.findMany({ where: { username: { in: names }, status: 'active' }, select: { id: true } });
  return users.map((u) => u.id);
}
