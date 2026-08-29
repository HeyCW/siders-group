import { sql } from 'drizzle-orm';
import { boolean, char, datetime, index, mysqlEnum, mysqlTable, varchar } from 'drizzle-orm/mysql-core';
import { newId } from '../newId.js';
import { roles } from './rbac.js';

export const USER_STATUS_VALUES = ['active', 'disabled'] as const;
export type UserStatus = (typeof USER_STATUS_VALUES)[number];

/** Staff only. Readers live in `readers.ts` — two identities, one `sessions` table. */
export const users = mysqlTable(
  'users',
  {
    id: char('id', { length: 36 }).primaryKey().$defaultFn(newId),
    email: varchar('email', { length: 320 }).notNull().unique(),
    // Always set — creation and reset generate a temporary password immediately, so there is
    // no credential-less window to model (see openspec/changes/add-auth-foundation/design.md -
    // "No email anywhere in the staff lifecycle").
    passwordHash: varchar('password_hash', { length: 255 }).notNull(),
    mustChangePassword: boolean('must_change_password').notNull().default(true),
    name: varchar('name', { length: 255 }).notNull(),
    roleId: char('role_id', { length: 36 })
      .notNull()
      .references(() => roles.id),
    status: mysqlEnum('status', USER_STATUS_VALUES).notNull().default('active'),
    lastLoginAt: datetime('last_login_at', { fsp: 3 }),
    createdAt: datetime('created_at', { fsp: 3 }).notNull().default(sql`CURRENT_TIMESTAMP(3)`),
    updatedAt: datetime('updated_at', { fsp: 3 }).notNull().default(sql`CURRENT_TIMESTAMP(3)`),
  },
  (table) => ({
    // Supports the gated-path lookup: session -> subject -> role_id -> role_permissions.
    roleIdx: index('users_role_idx').on(table.roleId),
  }),
);
