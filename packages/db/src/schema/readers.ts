import { boolean, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { app } from './schema';

export const readerStatus = app.enum('reader_status', ['active', 'banned']);

/** Google-authenticated readers, keyed on `google_sub` — never on email (docs/ARCHITECTURE.md §5.1). */
export const readers = app.table('readers', {
  id: uuid('id').primaryKey().defaultRandom(),
  googleSub: text('google_sub').notNull().unique(),
  email: text('email').notNull(),
  emailVerified: boolean('email_verified').notNull().default(false),
  name: text('name').notNull(),
  avatarUrl: text('avatar_url'),
  status: readerStatus('status').notNull().default('active'),
  mutedUntil: timestamp('muted_until', { withTimezone: true }),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
