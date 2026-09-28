import { avatarUrl } from './media.js';

// `user` may include the kyc relation ({ kyc: { status } }); without it the
// status reads as 'none', so callers that need it must select it.
export function toPublicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    plan: user.plan,
    initials: user.initials,
    avatarUrl: avatarUrl(user),
    memberSince: user.createdAt.toISOString().slice(0, 10),
    kycStatus: user.kyc?.status ?? 'none',
    mfaEnabled: !!user.mfaEnabledAt,
  };
}

export const PUBLIC_USER_INCLUDE = { kyc: { select: { status: true } } };
