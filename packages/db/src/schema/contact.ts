import { sql } from 'drizzle-orm';
import { char, datetime, index, mysqlEnum, mysqlTable, text, varchar } from 'drizzle-orm/mysql-core';
import { newId } from '../newId';

export const CONTACT_MESSAGE_STATUS_VALUES = ['new', 'read'] as const;
export type ContactMessageStatusValue = (typeof CONTACT_MESSAGE_STATUS_VALUES)[number];

/**
 * One row per public contact-form submission. `organisation` and `subject` are nullable — the
 * form treats them as optional (specs/contact-messages/spec.md - "Any visitor can submit a
 * contact message without authentication"). No foreign key to any session or reader: the
 * submitter is anonymous by definition, so there is no identity for this row to reference.
 */
export const contactMessages = mysqlTable(
  'contact_messages',
  {
    id: char('id', { length: 36 }).primaryKey().$defaultFn(newId),
    name: varchar('name', { length: 255 }).notNull(),
    organisation: varchar('organisation', { length: 255 }),
    email: varchar('email', { length: 320 }).notNull(),
    subject: varchar('subject', { length: 512 }),
    message: text('message').notNull(),
    status: mysqlEnum('status', CONTACT_MESSAGE_STATUS_VALUES).notNull().default('new'),
    createdAt: datetime('created_at', { fsp: 3 }).notNull().default(sql`CURRENT_TIMESTAMP(3)`),
  },
  (table) => ({
    // The inbox read: every message, newest first, optionally filtered by status.
    createdAtIdx: index('contact_messages_created_at_idx').on(table.createdAt),
    // The badge poll: `count(*) where status = 'new'` — cheap and pagination-free
    // (design.md - "Unread count is its own endpoint, not derived by the client from the full list").
    statusIdx: index('contact_messages_status_idx').on(table.status),
  }),
);
