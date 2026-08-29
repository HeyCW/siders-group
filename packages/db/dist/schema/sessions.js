import { sql } from 'drizzle-orm';
import { char, datetime, index, mysqlEnum, mysqlTable, text, varchar } from 'drizzle-orm/mysql-core';
import { newId } from '../newId.js';
export const SUBJECT_TYPE_VALUES = ['staff', 'reader'];
/**
 * One table for both audiences (docs/ARCHITECTURE.md §5.1). `subjectId` is polymorphic
 * across `users` and `readers`, so it carries no foreign key — every lookup filters on
 * `subjectType` and joins the correct subject table, re-validating the row still exists
 * and is active (see design.md - Risks: polymorphic `subject_id` has no FK).
 */
export const sessions = mysqlTable('sessions', {
    id: char('id', { length: 36 }).primaryKey().$defaultFn(newId), // the `sid` claim
    subjectId: char('subject_id', { length: 36 }).notNull(),
    subjectType: mysqlEnum('subject_type', SUBJECT_TYPE_VALUES).notNull(),
    refreshTokenHash: varchar('refresh_token_hash', { length: 128 }).notNull().unique(),
    familyId: char('family_id', { length: 36 }).notNull(),
    userAgent: text('user_agent'),
    ipHash: varchar('ip_hash', { length: 128 }),
    expiresAt: datetime('expires_at', { fsp: 3 }).notNull(), // sliding
    absoluteExpiresAt: datetime('absolute_expires_at', { fsp: 3 }).notNull(), // hard cap
    revokedAt: datetime('revoked_at', { fsp: 3 }),
    createdAt: datetime('created_at', { fsp: 3 }).notNull().default(sql `CURRENT_TIMESTAMP(3)`),
}, (table) => ({
    subjectIdx: index('sessions_subject_idx').on(table.subjectType, table.subjectId),
    familyIdx: index('sessions_family_idx').on(table.familyId),
}));
