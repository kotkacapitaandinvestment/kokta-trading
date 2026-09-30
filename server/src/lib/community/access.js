// Who can read, send in, and moderate a conversation.
//
//   dm / group            members only
//   community  public     anyone reads; anyone sends (joins on first message)
//              private    listed; join by approval; members read and send
//              invite     unlisted; join by invite link
//   room / event          public to every signed-in trader

import { prisma } from '../prisma.js';
import { isStaff } from './users.js';

export const PUBLIC_KINDS = ['room', 'event'];
export const MANAGER_ROLES = ['owner', 'admin'];
export const MOD_ROLES = ['owner', 'admin', 'moderator'];

export function isPublicConversation(c) {
  return PUBLIC_KINDS.includes(c.kind) || (c.kind === 'community' && c.visibility === 'public');
}

export function mutedMessage(me) {
  if (me.communityMutedUntil && new Date(me.communityMutedUntil) > new Date()) {
    const until = new Date(me.communityMutedUntil);
    const when = `${until.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })} at ${until.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })} UTC`;
    return `A moderator paused your posting until ${when}. You can still read and react.`;
  }
  return null;
}

// me: { id, role, communityMutedUntil }
export async function conversationAccess(conversationOrId, me) {
  const conv =
    typeof conversationOrId === 'string'
      ? await prisma.conversation.findUnique({ where: { id: conversationOrId } })
      : conversationOrId;
  if (!conv) return { conv: null, canRead: false, canSend: false, reason: 'This chat was deleted, or you’re no longer in it.' };
  const [member, dmOther] = await Promise.all([
    prisma.conversationMember.findUnique({ where: { conversationId_userId: { conversationId: conv.id, userId: me.id } } }),
    conv.kind === 'dm' ? prisma.conversationMember.findFirst({ where: { conversationId: conv.id, userId: { not: me.id } }, select: { userId: true } }) : null,
  ]);
  const activeMember = member?.status === 'active';
  const pub = isPublicConversation(conv);
  const staff = isStaff(me);

  const canRead = pub || activeMember;
  const canModerate = (activeMember && MOD_ROLES.includes(member.role)) || (staff && pub);
  const canManage = (activeMember && MANAGER_ROLES.includes(member.role)) || (staff && pub && conv.kind !== 'dm');

  let canSend = canRead;
  let reason = canRead ? null : 'Join this chat to read and reply.';
  const muted = mutedMessage(me);
  if (canSend && muted) [canSend, reason] = [false, muted];
  if (canSend && conv.archivedAt) [canSend, reason] = [false, 'This chat is closed to new messages.'];
  if (canSend && conv.sendPolicy === 'admins' && !canModerate) [canSend, reason] = [false, 'Only admins can send messages here.'];
  if (canSend && conv.kind === 'dm') {
    const other = dmOther;
    if (other) {
      const block = await prisma.userRelation.findFirst({
        where: { kind: 'block', OR: [{ userId: me.id, targetId: other.userId }, { userId: other.userId, targetId: me.id }] },
        select: { userId: true },
      });
      if (block) [canSend, reason] = [false, block.userId === me.id ? 'You blocked this trader. Unblock them to send messages.' : "You can't message this trader."];
    }
  }
  return { conv, member, activeMember, canRead, canSend, canModerate, canManage, reason };
}

// Adds the sender to a public conversation on first message (so it shows in
// their list and they get unread counts).
export async function ensureMember(conversationId, userId, role = 'member') {
  return prisma.conversationMember.upsert({
    where: { conversationId_userId: { conversationId, userId } },
    update: {},
    create: { conversationId, userId, role },
  });
}

// Channel(s) to publish a conversation's live events on.
export async function conversationChannels(conv) {
  if (isPublicConversation(conv)) return [`conv:${conv.id}`];
  const members = await prisma.conversationMember.findMany({ where: { conversationId: conv.id, status: 'active' }, select: { userId: true } });
  return members.map((m) => `user:${m.userId}`);
}

// An account is being deleted: every group or community it owns passes to
// the next longest-standing admin or member, so none is left without an owner.
export async function handOverOwnership(userId) {
  const owned = await prisma.conversationMember.findMany({ where: { userId, role: 'owner', status: 'active', conversation: { kind: { not: 'dm' } } }, select: { conversationId: true } });
  for (const { conversationId } of owned) {
    const heir = await prisma.conversationMember.findFirst({ where: { conversationId, status: 'active', userId: { not: userId } }, orderBy: [{ role: 'asc' }, { joinedAt: 'asc' }] });
    if (heir) await prisma.conversationMember.update({ where: { id: heir.id }, data: { role: 'owner' } });
  }
  return owned.length;
}
