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
    return `A moderator has paused your posting until ${new Date(me.communityMutedUntil).toUTCString().replace(' GMT', ' UTC')}.`;
  }
  return null;
}

// me: { id, role, communityMutedUntil }
export async function conversationAccess(conversationOrId, me) {
  const conv =
    typeof conversationOrId === 'string'
      ? await prisma.conversation.findUnique({ where: { id: conversationOrId } })
      : conversationOrId;
  if (!conv) return { conv: null, canRead: false, canSend: false, reason: 'Conversation not found.' };
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
  let reason = canRead ? null : 'You are not a member of this conversation.';
  const muted = mutedMessage(me);
  if (canSend && muted) [canSend, reason] = [false, muted];
  if (canSend && conv.archivedAt) [canSend, reason] = [false, 'This conversation is archived.'];
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
