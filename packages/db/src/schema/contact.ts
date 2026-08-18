import { index, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { app } from './schema';

/**
 * `new` is the only state a submission can arrive in; `read` is set only by a permitted staff
 * caller and can be toggled back to `new` (specs/contact-messages/spec.md - "A permitted caller
 * can mark a message read or unread"). There is no third state and no deletion — a message
 * persists indefinitely (design.md - Non-Goals).
 */
export const contactMessageStatus = app.enum('contact_message_status', ['new', 'read']);

/**
 * One row per public contact-form submission. `organisation` and `subject` are nullable — the
 * form treats them as optional (specs/contact-messages/spec.md - "Any visitor can submit a
 * contact message without authentication"). No foreign key to any session or reader: the
 * submitter is anonymous by definition, so there is no identity for this row to reference.
 */
export const contactMessages = app.table(
  'contact_messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    organisation: text('organisation'),
    email: text('email').notNull(),
    subject: text('subject'),
    message: text('message').notNull(),
    status: contactMessageStatus('status').notNull().default('new'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    // The inbox read: every message, newest first, optionally filtered by status.
    createdAtIdx: index('contact_messages_created_at_idx').on(table.createdAt),
    // The badge poll: `count(*) where status = 'new'` — cheap and pagination-free
    // (design.md - "Unread count is its own endpoint, not derived by the client from the full list").
    statusIdx: index('contact_messages_status_idx').on(table.status),
  }),
);
