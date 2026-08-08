import { boolean, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { app } from './schema';

/**
 * `slug` recognizes the seeded Owner role. `is_system` is set only by migration —
 * never through the API — so a client payload can never mint a second system role
 * (see openspec/changes/add-auth-foundation/design.md - Decisions).
 */
export const roles = app.table('roles', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull().unique(),
  slug: text('slug').notNull().unique(),
  isSystem: boolean('is_system').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Fixed catalog — seeded by migration only, never created through the API. */
export const permissions = app.table('permissions', {
  id: uuid('id').primaryKey().defaultRandom(),
  key: text('key').notNull().unique(),
  description: text('description').notNull(),
});

export const rolePermissions = app.table(
  'role_permissions',
  {
    roleId: uuid('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'cascade' }),
    permissionId: uuid('permission_id')
      .notNull()
      .references(() => permissions.id, { onDelete: 'cascade' }),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.roleId, table.permissionId] }),
  }),
);
