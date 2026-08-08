import { eq } from 'drizzle-orm';
import { roles, type Database } from '@siders/db';

let cachedOwnerRoleId: string | undefined;

/**
 * Resolved once and cached. Owner recognition is by this immutable seeded id, never by
 * re-checking a name or slug on every call — a caller-editable string in this path would be
 * a privilege-escalation vector (design.md - "Owner recognition keyed on the seeded row's
 * immutable id, never on a slug").
 */
export async function getOwnerRoleId(db: Database): Promise<string> {
  if (cachedOwnerRoleId) return cachedOwnerRoleId;
  const [row] = await db.select({ id: roles.id }).from(roles).where(eq(roles.isSystem, true)).limit(1);
  if (!row) throw new Error('Owner role not found — has the seed migration run?');
  cachedOwnerRoleId = row.id;
  return cachedOwnerRoleId;
}

/** Test-only: clears the memoized id so a test can reload with a fresh one. */
export function __resetOwnerRoleCacheForTests(): void {
  cachedOwnerRoleId = undefined;
}
