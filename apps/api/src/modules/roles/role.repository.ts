import { eq, inArray } from 'drizzle-orm';
import { permissions, roles, rolePermissions, users, type Database } from '@siders/db';

export interface RoleRow {
  id: string;
  name: string;
  slug: string;
  isSystem: boolean;
}

export interface RoleWithPermissions extends RoleRow {
  permissions: string[];
}

export interface CreateRoleInput {
  name: string;
  slug: string;
  permissionKeys: string[];
}

export interface UpdateRoleInput {
  name?: string | undefined;
  /** Always travels with `name` — the two are derived from one value and must not drift apart. */
  slug?: string | undefined;
  permissionKeys?: string[] | undefined;
}

export interface PermissionCatalogEntry {
  key: string;
  description: string;
}

/** Drizzle queries only — no Express types here. */
export interface RoleRepository {
  findByName(name: string): Promise<RoleRow | null>;
  findBySlug(slug: string): Promise<RoleRow | null>;
  findById(id: string): Promise<RoleWithPermissions | null>;
  listCatalogPermissions(): Promise<PermissionCatalogEntry[]>;
  create(input: CreateRoleInput): Promise<RoleWithPermissions>;
  update(id: string, input: UpdateRoleInput): Promise<RoleWithPermissions>;
  delete(id: string): Promise<void>;
  countStaffWithRole(id: string): Promise<number>;
  /** Resolves false when no staff member has that id, so the caller can 404 rather than 204. */
  assignRole(staffId: string, roleId: string): Promise<boolean>;
}

/** The database handle or an open transaction — the same query surface either way. */
type Executor = Database | Parameters<Parameters<Database['transaction']>[0]>[0];

export function createRoleRepository(db: Database): RoleRepository {
  async function loadPermissionKeys(roleId: string): Promise<string[]> {
    const rows = await db
      .select({ key: permissions.key })
      .from(rolePermissions)
      .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
      .where(eq(rolePermissions.roleId, roleId));
    return rows.map((r) => r.key);
  }

  /**
   * Delete-then-insert, so it must run inside a transaction: interrupted between the two, the
   * role is left holding no permissions at all rather than either its old or its new set.
   */
  async function replacePermissions(roleId: string, permissionKeys: string[], tx: Executor): Promise<void> {
    await tx.delete(rolePermissions).where(eq(rolePermissions.roleId, roleId));
    if (permissionKeys.length === 0) return;
    const matched = await tx
      .select({ id: permissions.id })
      .from(permissions)
      .where(inArray(permissions.key, permissionKeys));
    if (matched.length > 0) {
      await tx.insert(rolePermissions).values(matched.map((p) => ({ roleId, permissionId: p.id })));
    }
  }

  const findById = async (id: string): Promise<RoleWithPermissions | null> => {
    const [row] = await db.select().from(roles).where(eq(roles.id, id)).limit(1);
    if (!row) return null;
    return { ...row, permissions: await loadPermissionKeys(id) };
  };

  return {
    async findByName(name) {
      const [row] = await db.select().from(roles).where(eq(roles.name, name)).limit(1);
      return row ?? null;
    },

    async findBySlug(slug) {
      const [row] = await db.select().from(roles).where(eq(roles.slug, slug)).limit(1);
      return row ?? null;
    },

    findById,

    async listCatalogPermissions() {
      return db.select({ key: permissions.key, description: permissions.description }).from(permissions);
    },

    async create(input) {
      // One transaction: the role row and its grants are a single fact. Written separately, a
      // failure between them leaves a role that exists and authorizes nothing — and role
      // creation reports success either way (CLAUDE.md - "transactions where appropriate").
      return db.transaction(async (tx) => {
        const [row] = await tx.insert(roles).values({ name: input.name, slug: input.slug }).returning();
        if (!row) throw new Error('role insert returned no row');
        await replacePermissions(row.id, input.permissionKeys, tx);
        return { ...row, permissions: input.permissionKeys };
      });
    },

    async update(id, input) {
      await db.transaction(async (tx) => {
        if (input.name !== undefined) {
          await tx
            .update(roles)
            .set({ name: input.name, ...(input.slug !== undefined && { slug: input.slug }), updatedAt: new Date() })
            .where(eq(roles.id, id));
        }
        if (input.permissionKeys !== undefined) {
          await replacePermissions(id, input.permissionKeys, tx);
        }
      });
      const updated = await findById(id);
      if (!updated) throw new Error('role missing immediately after update');
      return updated;
    },

    async delete(id) {
      await db.delete(roles).where(eq(roles.id, id));
    },

    async countStaffWithRole(id) {
      const rows = await db.select({ id: users.id }).from(users).where(eq(users.roleId, id));
      return rows.length;
    },

    async assignRole(staffId, roleId) {
      // `returning` so a staff id matching no row is distinguishable from a real assignment.
      // Without it the update quietly affects zero rows and the endpoint answers 204, telling
      // an administrator the role was assigned when nothing happened at all.
      const assigned = await db
        .update(users)
        .set({ roleId, updatedAt: new Date() })
        .where(eq(users.id, staffId))
        .returning({ id: users.id });
      return assigned.length > 0;
    },
  };
}
