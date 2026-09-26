// Market rooms (one per instrument) and event rooms (one per market event),
// created on first use.
import { prisma } from '../prisma.js';
import { instrument } from '../instruments.js';

export async function ensureMarketRoom(symbol) {
  const inst = instrument(symbol);
  if (!inst) return null;
  const slug = `m-${inst.symbol.toLowerCase()}`;
  const existing = await prisma.conversation.findUnique({ where: { slug } });
  if (existing) return existing;
  try {
    return await prisma.conversation.create({
      data: { kind: 'room', visibility: 'public', slug, name: inst.display, description: `${inst.name}: live discussion`, instrument: inst.symbol, joinPolicy: 'open' },
    });
  } catch {
    return prisma.conversation.findUnique({ where: { slug } }); // created concurrently
  }
}

export async function ensureEventRoom(event) {
  const existing = await prisma.conversation.findUnique({ where: { eventId: event.id } });
  if (existing) return existing;
  try {
    return await prisma.conversation.create({
      data: { kind: 'event', visibility: 'public', slug: `e-${event.id}`, name: event.title, description: `${event.currency} · ${event.importance} importance`, eventId: event.id, joinPolicy: 'open' },
    });
  } catch {
    return prisma.conversation.findUnique({ where: { eventId: event.id } });
  }
}
