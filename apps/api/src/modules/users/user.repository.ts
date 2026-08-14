import { eq } from 'drizzle-orm';
import { roles, users, type Database } from '@siders/db';

/**
 * The DB-only columns this repository actually queries — deliberately narrower than
 * `StaffUserRow` (user.mapper.ts), which also carries `permissionKeys`/`isOwner`. Those two
 * are sourced from `req.staffRole` by `user.service.ts`, not from a second
 * `role_permissions` join here (design.md - "sources permissionKeys/isOwner from
 * req.staffRole, not a second query").
 */
export interface StaffUserQueryRow {
  id: string;
  email: string;
  name: string;
  roleId: string;
  roleName: string;
  status: 'active' | 'disabled';
  mustChangePassword: boolean;
  createdAt: Date;
}

/** Drizzle queries only — no Express types here. */
export interface UserRepository {
  findById(id: string): Promise<StaffUserQueryRow | null>;
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
