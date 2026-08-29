import { sql } from 'drizzle-orm';
import { boolean, char, datetime, mysqlEnum, mysqlTable, text, varchar } from 'drizzle-orm/mysql-core';
import { newId } from '../newId.js';
export const READER_STATUS_VALUES = ['active', 'banned'];
/** Google-authenticated readers, keyed on `google_sub` — never on email (docs/ARCHITECTURE.md §5.1). */
export const readers = mysqlTable('readers', {
    id: char('id', { length: 36 }).primaryKey().$defaultFn(newId),
    googleSub: varchar('google_sub', { length: 128 }).notNull().unique(),
    email: varchar('email', { length: 320 }).notNull(),
    emailVerified: boolean('email_verified').notNull().default(false),
    name: varchar('name', { length: 255 }).notNull(),
    avatarUrl: text('avatar_url'),
    status: mysqlEnum('status', READER_STATUS_VALUES).notNull().default('active'),
    mutedUntil: datetime('muted_until', { fsp: 3 }),
    lastLoginAt: datetime('last_login_at', { fsp: 3 }),
    createdAt: datetime('created_at', { fsp: 3 }).notNull().default(sql `CURRENT_TIMESTAMP(3)`),
    updatedAt: datetime('updated_at', { fsp: 3 }).notNull().default(sql `CURRENT_TIMESTAMP(3)`),
});
