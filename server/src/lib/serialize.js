export function toPublicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    plan: user.plan,
    initials: user.initials,
    memberSince: user.createdAt.toISOString().slice(0, 10),
  };
}
