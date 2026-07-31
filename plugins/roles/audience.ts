import type { SqlDb } from '../data.ts';

/** Returns the role keys currently assigned to a GLAB member. */
export function resolveRoles(db: SqlDb, userId: string): string[] {
  return db.prepare(
    'SELECT role FROM glab_member_role WHERE user_id = ? ORDER BY role ASC',
  ).all(userId).flatMap((row) => {
    const role = (row as { role?: unknown }).role;
    return typeof role === 'string' ? [role] : [];
  });
}

/** Applies forum/event audience rules at the server boundary. */
export function canSee(
  audienceRoles: string[] | null,
  userRoles: string[],
  isOwner: boolean,
  isAdmin: boolean,
): boolean {
  if (!audienceRoles || audienceRoles.length === 0) return true;
  if (isOwner || isAdmin) return true;
  return audienceRoles.some((role) => userRoles.includes(role));
}
