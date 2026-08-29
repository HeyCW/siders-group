import { count, eq, inArray } from 'drizzle-orm';
import { newId, permissions, roles, rolePermissions, users } from '@siders/db';
export function createRoleRepository(db) {
    async function loadPermissionKeys(roleId) {
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
    async function replacePermissions(roleId, permissionKeys, tx) {
        await tx.delete(rolePermissions).where(eq(rolePermissions.roleId, roleId));
        if (permissionKeys.length === 0)
            return;
        const matched = await tx
            .select({ id: permissions.id })
            .from(permissions)
            .where(inArray(permissions.key, permissionKeys));
        if (matched.length > 0) {
            await tx.insert(rolePermissions).values(matched.map((p) => ({ roleId, permissionId: p.id })));
        }
    }
    const findById = async (id) => {
        const [row] = await db.select().from(roles).where(eq(roles.id, id)).limit(1);
        if (!row)
            return null;
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
        async listWithHolderCounts() {
            // LEFT JOIN so a role with no holders still produces a row; count(users.id) counts only
            // the non-null (i.e. matched) side of that join, so an unmatched role reads as 0 rather
            // than being dropped.
            return db
                .select({
                id: roles.id,
                name: roles.name,
                slug: roles.slug,
                isSystem: roles.isSystem,
                holderCount: count(users.id),
            })
                .from(roles)
                .leftJoin(users, eq(users.roleId, roles.id))
                .groupBy(roles.id);
        },
        async listCatalogPermissions() {
            return db.select({ key: permissions.key, description: permissions.description }).from(permissions);
        },
        async create(input) {
            // One transaction: the role row and its grants are a single fact. Written separately, a
            // failure between them leaves a role that exists and authorizes nothing — and role
            // creation reports success either way (CLAUDE.md - "transactions where appropriate").
            return db.transaction(async (tx) => {
                const id = newId();
                await tx.insert(roles).values({ id, name: input.name, slug: input.slug });
                const [row] = await tx.select().from(roles).where(eq(roles.id, id)).limit(1);
                if (!row)
                    throw new Error('role missing immediately after insert');
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
            if (!updated)
                throw new Error('role missing immediately after update');
            return updated;
        },
        async delete(id) {
            await db.delete(roles).where(eq(roles.id, id));
        },
        async countStaffWithRole(id) {
            const [row] = await db.select({ value: count() }).from(users).where(eq(users.roleId, id));
            return row?.value ?? 0;
        },
        async findAssignedRoleId(staffId) {
            const [row] = await db.select({ roleId: users.roleId }).from(users).where(eq(users.id, staffId)).limit(1);
            return row?.roleId ?? null;
        },
        async assignRole(staffId, roleId) {
            // The affected-rows count is what distinguishes a staff id matching no row from a real
            // assignment. Without it the update quietly affects zero rows and the endpoint answers
            // 204, telling an administrator the role was assigned when nothing happened at all.
            const [result] = await db
                .update(users)
                .set({ roleId, updatedAt: new Date() })
                .where(eq(users.id, staffId));
            return result.affectedRows > 0;
        },
    };
}
