import { asc, eq, sql } from 'drizzle-orm';
import { roles, users, type Database } from '@siders/db';
import { AppError } from '../../middleware/errorHandler.js';

export interface StaffRow {
  id: string;
  email: string;
  passwordHash: string;
  mustChangePassword: boolean;
  name: string;
  roleId: string;
  roleName: string;
  status: 'active' | 'disabled';
  createdAt: Date;
}

export interface CreateStaffInput {
  email: string;
  name: string;
  roleId: string;
  passwordHash: string;
}

/** Drizzle queries only. Shared by staff sign-in (group 9) and staff account management (group 10). */
export interface StaffRepository {
  findByEmail(email: string): Promise<StaffRow | null>;
  findById(id: string): Promise<StaffRow | null>;
  /** Every staff account, name-ordered, disabled accounts included. */
  list(): Promise<StaffRow[]>;
  create(input: CreateStaffInput): Promise<StaffRow>;
  /** Self-service change: sets the hash and clears the forced-change flag in one statement. */
  setPassword(id: string, passwordHash: string): Promise<void>;
  /** Admin-triggered reset: replaces the hash and re-arms the forced-change flag. */
  resetPassword(id: string, passwordHash: string): Promise<void>;
  clearPasswordChangeFlag(id: string): Promise<void>;
  setStatus(id: string, status: 'active' | 'disabled'): Promise<void>;
  setRole(id: string, roleId: string): Promise<void>;
}

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
} as const;

const UNIQUE_VIOLATION = '23505';

/**
 * Turns the unique-constraint violation into the same 409 the pre-insert existence check
 * raises. That check is a read-then-insert, so two concurrent creations for one address both
 * see "no existing account" and both proceed — the constraint is what actually settles it, and
 * without this translation the loser surfaced as a 500 claiming a server fault for an ordinary
 * conflict (specs/staff-account-management/spec.md - "Creating an account for an email that
 * already has one is rejected").
 */
async function insertOrTranslateDuplicate<T>(insert: () => Promise<T>): Promise<T> {
  try {
    return await insert();
  } catch (err) {
    if ((err as { code?: string }).code === UNIQUE_VIOLATION) {
      throw new AppError('An account with this email already exists', 409, 'email_exists');
    }
    throw err;
  }
}

export function createStaffRepository(db: Database): StaffRepository {
  const baseQuery = () => db.select(SELECT_COLUMNS).from(users).innerJoin(roles, eq(users.roleId, roles.id));

  const findById = async (id: string): Promise<StaffRow | null> => {
    const [row] = await baseQuery().where(eq(users.id, id)).limit(1);
    return row ?? null;
  };

  return {
    async findByEmail(email) {
      // Matched on `lower(email)` against the `users_email_lower_unique` index rather than on
      // the raw column, so a row written outside the contract boundary (seed.sql, a manual
      // insert) is still found by the duplicate check and by sign-in.
      const [row] = await baseQuery()
        .where(sql`lower(${users.email}) = lower(${email})`)
        .limit(1);
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
      const [inserted] = await insertOrTranslateDuplicate(() =>
        db
          .insert(users)
          .values({ email: input.email, name: input.name, roleId: input.roleId, passwordHash: input.passwordHash })
          .returning({ id: users.id }),
      );
      if (!inserted) throw new Error('staff insert returned no row');
      const created = await findById(inserted.id);
      if (!created) throw new Error('staff row missing immediately after insert');
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
