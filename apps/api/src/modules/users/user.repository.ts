import { eq } from 'drizzle-orm';
import { roles, users, type Database } from '@siders/db';
import type { StaffUserRow } from './user.mapper.js';

/** Drizzle queries only — no Express types here. */
export interface UserRepository {
  findById(id: string): Promise<StaffUserRow | null>;
}

export function createUserRepository(db: Database): UserRepository {
  return {
    async findById(id) {
      const [row] = await db
        .select({
          id: users.id,
          email: users.email,
          name: users.name,
          roleId: users.roleId,
          roleName: roles.name,
          status: users.status,
          mustChangePassword: users.mustChangePassword,
          createdAt: users.createdAt,
        })
        .from(users)
        .innerJoin(roles, eq(users.roleId, roles.id))
        .where(eq(users.id, id))
        .limit(1);
      return row ?? null;
    },
  };
}
