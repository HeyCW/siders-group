import { index, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { app } from './schema';

export const subjectType = app.enum('subject_type', ['staff', 'reader']);

/**
 * One table for both audiences (docs/ARCHITECTURE.md §5.1). `subjectId` is polymorphic
 * across `users` and `readers`, so it carries no foreign key — every lookup filters on
 * `subjectType` and joins the correct subject table, re-validating the row still exists
 * and is active (see design.md - Risks: polymorphic `subject_id` has no FK).
 */
export const sessions = app.table(
  'sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(), // the `sid` claim
    subjectId: uuid('subject_id').notNull(),
    subjectType: subjectType('subject_type').notNull(),
    refreshTokenHash: text('refresh_token_hash').notNull().unique(),
    familyId: uuid('family_id').notNull(),
    userAgent: text('user_agent'),
    ipHash: text('ip_hash'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(), // sliding
    absoluteExpiresAt: timestamp('absolute_expires_at', { withTimezone: true }).notNull(), // hard cap
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    subjectIdx: index('sessions_subject_idx').on(table.subjectType, table.subjectId),
    familyIdx: index('sessions_family_idx').on(table.familyId),
  }),
);
