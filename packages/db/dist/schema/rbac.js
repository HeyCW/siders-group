import { sql } from 'drizzle-orm';
import { boolean, char, datetime, mysqlTable, primaryKey, text, varchar } from 'drizzle-orm/mysql-core';
import { newId } from '../newId.js';
/**
 * `slug` recognizes the seeded Owner role. `is_system` is set only by migration —
 * never through the API — so a client payload can never mint a second system role
 * (see openspec/changes/add-auth-foundation/design.md - Decisions).
 */
export const roles = mysqlTable('roles', {
    id: char('id', { length: 36 }).primaryKey().$defaultFn(newId),
    name: varchar('name', { length: 191 }).notNull().unique(),
    slug: varchar('slug', { length: 191 }).notNull().unique(),
    isSystem: boolean('is_system').notNull().default(false),
    createdAt: datetime('created_at', { fsp: 3 }).notNull().default(sql `CURRENT_TIMESTAMP(3)`),
    updatedAt: datetime('updated_at', { fsp: 3 }).notNull().default(sql `CURRENT_TIMESTAMP(3)`),
});
/** Fixed catalog — seeded by migration only, never created through the API. */
export const permissions = mysqlTable('permissions', {
    id: char('id', { length: 36 }).primaryKey().$defaultFn(newId),
    key: varchar('key', { length: 191 }).notNull().unique(),
    description: text('description').notNull(),
});
export const rolePermissions = mysqlTable('role_permissions', {
    roleId: char('role_id', { length: 36 })
        .notNull()
        .references(() => roles.id, { onDelete: 'cascade' }),
    permissionId: char('permission_id', { length: 36 })
        .notNull()
        .references(() => permissions.id, { onDelete: 'cascade' }),
}, (table) => ({
    pk: primaryKey({ columns: [table.roleId, table.permissionId] }),
}));
