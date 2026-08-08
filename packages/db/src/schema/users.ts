import { boolean, index, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { app } from './schema';
import { roles } from './rbac';

export const userStatus = app.enum('user_status', ['active', 'disabled']);

/** Staff only. Readers live in `readers.ts` — two identities, one `sessions` table. */
export const users = app.table(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull().unique(),
    // Always set — creation and reset generate a temporary password immediately, so there is
    // no credential-less window to model (see openspec/changes/add-auth-foundation/design.md -
    // "No email anywhere in the staff lifecycle").
    passwordHash: text('password_hash').notNull(),
    mustChangePassword: boolean('must_change_password').notNull().default(true),
    name: text('name').notNull(),
    roleId: uuid('role_id')
      .notNull()
      .references(() => roles.id),
    status: userStatus('status').notNull().default('active'),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    // Supports the gated-path lookup: session -> subject -> role_id -> role_permissions.
    roleIdx: index('users_role_idx').on(table.roleId),
  }),
);
