import { eq } from 'drizzle-orm';
import { roles, users, type Database } from '@siders/db';

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
  create(input: CreateStaffInput): Promise<StaffRow>;
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

export function createStaffRepository(db: Database): StaffRepository {
  const baseQuery = () => db.select(SELECT_COLUMNS).from(users).innerJoin(roles, eq(users.roleId, roles.id));

  const findById = async (id: string): Promise<StaffRow | null> => {
    const [row] = await baseQuery().where(eq(users.id, id)).limit(1);
    return row ?? null;
  };

  return {
    async findByEmail(email) {
      const [row] = await baseQuery().where(eq(users.email, email)).limit(1);
      return row ?? null;
    },

    findById,

    async create(input) {
      // Created active with must_change_password true by column default — creation never
      // supplies that flag explicitly, so there is one place (the schema) asserting every
      // new account starts in the forced-change state.
      const [inserted] = await db
        .insert(users)
        .values({ email: input.email, name: input.name, roleId: input.roleId, passwordHash: input.passwordHash })
        .returning({ id: users.id });
      if (!inserted) throw new Error('staff insert returned no row');
      const created = await findById(inserted.id);
      if (!created) throw new Error('staff row missing immediately after insert');
      return created;
    },

    async setPassword(id, passwordHash) {
      await db.update(users).set({ passwordHash, updatedAt: new Date() }).where(eq(users.id, id));
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
