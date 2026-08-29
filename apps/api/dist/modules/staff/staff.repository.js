import { asc, eq } from 'drizzle-orm';
import { newId, roles, users } from '@siders/db';
import { AppError } from '../../middleware/errorHandler.js';
import { isUniqueViolation } from '../../lib/dbErrors.js';
const SELECT_COLUMNS = {
    id: users.id,
    email: users.email,
    passwordHash: users.passwordHash,
    mustChangePassword: users.mustChangePassword,
    name: users.name,
    roleId: users.roleId,
    roleName: roles.name,
    status: users.status,
    createdAt: users.createdAt,
};
/**
 * Turns the unique-constraint violation into the same 409 the pre-insert existence check
 * raises. That check is a read-then-insert, so two concurrent creations for one address both
 * see "no existing account" and both proceed — the constraint is what actually settles it, and
 * without this translation the loser surfaced as a 500 claiming a server fault for an ordinary
 * conflict (specs/staff-account-management/spec.md - "Creating an account for an email that
 * already has one is rejected").
 */
async function insertOrTranslateDuplicate(insert) {
    try {
        return await insert();
    }
    catch (err) {
        if (isUniqueViolation(err)) {
            throw new AppError('An account with this email already exists', 409, 'email_exists');
        }
        throw err;
    }
}
export function createStaffRepository(db) {
    const baseQuery = () => db.select(SELECT_COLUMNS).from(users).innerJoin(roles, eq(users.roleId, roles.id));
    const findById = async (id) => {
        const [row] = await baseQuery().where(eq(users.id, id)).limit(1);
        return row ?? null;
    };
    return {
        async findByEmail(email) {
            // A plain equality match is sufficient here — every column in this schema uses MySQL's
            // `utf8mb4_0900_ai_ci` collation (packages/db/src/schema; the whole database is created
            // with it), which is case-insensitive by construction. The Postgres version needed
            // `lower(email) = lower(?)` against a hand-written functional index
            // (`users_email_lower_unique`, `supabase/migrations/0000_useful_red_shift.sql`) because
            // Postgres's default collation is case-sensitive; that index has no MySQL equivalent
            // because it has no MySQL *need* — `users.email`'s own unique index already enforces and
            // serves case-insensitive lookups for free.
            const [row] = await baseQuery().where(eq(users.email, email)).limit(1);
            return row ?? null;
        },
        findById,
        async list() {
            return baseQuery().orderBy(asc(users.name));
        },
        async create(input) {
            // Created active with must_change_password true by column default — creation never
            // supplies that flag explicitly, so there is one place (the schema) asserting every
            // new account starts in the forced-change state.
            const id = newId();
            await insertOrTranslateDuplicate(() => db.insert(users).values({ id, email: input.email, name: input.name, roleId: input.roleId, passwordHash: input.passwordHash }));
            const created = await findById(id);
            if (!created)
                throw new Error('staff row missing immediately after insert');
            return created;
        },
        async setPassword(id, passwordHash) {
            // The new hash and the cleared flag are one change: written separately, a failure between
            // them leaves the staff member with a working new password that the pending-change gate
            // still refuses at every gated endpoint, or — worse the other way round — a cleared flag
            // over an unchanged password.
            await db
                .update(users)
                .set({ passwordHash, mustChangePassword: false, updatedAt: new Date() })
                .where(eq(users.id, id));
        },
        async resetPassword(id, passwordHash) {
            await db
                .update(users)
                .set({ passwordHash, mustChangePassword: true, updatedAt: new Date() })
                .where(eq(users.id, id));
        },
        async clearPasswordChangeFlag(id) {
            await db.update(users).set({ mustChangePassword: false, updatedAt: new Date() }).where(eq(users.id, id));
        },
        async setStatus(id, status) {
            await db.update(users).set({ status, updatedAt: new Date() }).where(eq(users.id, id));
        },
        async setRole(id, roleId) {
            await db.update(users).set({ roleId, updatedAt: new Date() }).where(eq(users.id, id));
        },
    };
}
