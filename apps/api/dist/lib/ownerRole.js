import { eq } from 'drizzle-orm';
import { roles } from '@siders/db';
let cachedOwnerRoleId;
/**
 * Resolved once and cached. Owner recognition is by this immutable seeded id, never by
 * re-checking a name or slug on every call — a caller-editable string in this path would be
 * a privilege-escalation vector (design.md - "Owner recognition keyed on the seeded row's
 * immutable id, never on a slug").
 */
export async function getOwnerRoleId(db) {
    if (cachedOwnerRoleId)
        return cachedOwnerRoleId;
    // No `.limit(1)`: the seed creates exactly one `is_system` role, so a second one means the
    // invariant this whole check rests on is broken. `limit(1)` with no ORDER BY would have
    // silently picked whichever row the database returned first — a non-deterministic choice of who
    // counts as Owner — so the ambiguity is surfaced instead of arbitrated.
    const rows = await db.select({ id: roles.id }).from(roles).where(eq(roles.isSystem, true));
    const [row] = rows;
    if (!row)
        throw new Error('Owner role not found — has the seed migration run?');
    if (rows.length > 1) {
        throw new Error(`Expected exactly one is_system role, found ${rows.length} — Owner identity is ambiguous`);
    }
    cachedOwnerRoleId = row.id;
    return cachedOwnerRoleId;
}
/** Test-only: clears the memoized id so a test can reload with a fresh one. */
export function __resetOwnerRoleCacheForTests() {
    cachedOwnerRoleId = undefined;
}
