import { sql } from 'drizzle-orm';
import { boolean, char, datetime, index, mysqlEnum, mysqlTable, text, uniqueIndex } from 'drizzle-orm/mysql-core';
import { newId } from '../newId.js';
import { users } from './users.js';
import { readers } from './readers.js';
import { comments } from './engagement.js';
export const MODERATION_TARGET_TYPE_VALUES = ['comment', 'reader'];
/** `comment_reports_dismissed` is its own action, distinct from `comment_removed` — "this comment
 *  stays up despite being reported" is a decision worth its own record
 *  (design.md - Decision 8). */
export const MODERATION_ACTION_VALUES = [
    'comment_removed',
    'comment_restored',
    'comment_reports_dismissed',
    'reader_muted',
    'reader_unmuted',
    'reader_banned',
    'reader_unbanned',
];
/**
 * One row per moderation action taken, never overwritten — a repeat offender is a question this
 * table can answer and a `removed_by`/`banned_at` column pair on the target tables could not
 * (design.md - Decision 3, "Only the latest action is ever visible"). This is not the general
 * `audit_log` `docs/ARCHITECTURE.md` §11 still lists as outstanding: it is scoped to exactly the
 * seven actions above, with a shape suited to that narrow purpose, not a stand-in for logging
 * every admin mutation.
 *
 * `targetId` is **deliberately not a foreign key** to either `comments` or `readers` — the table
 * is polymorphic across both, so one FK column cannot reference either, and a target deleted
 * later should not be able to erase the record that it was once moderated (design.md - Decision
 * 3). The cost, stated plainly: `targetId` carries no referential integrity, so a reference to a
 * since-deleted target is possible, and reading moderation history against one is the
 * application's responsibility, not the database's.
 *
 * No column is added to `comments` or `readers` here. `status` (both tables) and `mutedUntil`
 * (`readers`) already exist and are already enforced — by `visibleComments()` in
 * `engagement.repository.ts` and by `requireReader` in
 * `apps/api/src/middleware/authorize.ts` — before this table or the surface that writes to them
 * existed. This table only gives staff a way to set them, and a record that they did.
 */
export const moderationActions = mysqlTable('moderation_actions', {
    id: char('id', { length: 36 }).primaryKey().$defaultFn(newId),
    actorId: char('actor_id', { length: 36 })
        .notNull()
        .references(() => users.id),
    targetType: mysqlEnum('target_type', MODERATION_TARGET_TYPE_VALUES).notNull(),
    targetId: char('target_id', { length: 36 }).notNull(),
    action: mysqlEnum('action', MODERATION_ACTION_VALUES).notNull(),
    reason: text('reason'),
    createdAt: datetime('created_at', { fsp: 3 }).notNull().default(sql `CURRENT_TIMESTAMP(3)`),
}, (table) => ({
    // Per-target history: "has this comment or reader been moderated before, and how".
    targetHistoryIdx: index('moderation_actions_target_history_idx').on(table.targetType, table.targetId, table.createdAt),
    // The queue read: every action, newest first, regardless of target.
    createdAtIdx: index('moderation_actions_created_at_idx').on(table.createdAt),
}));
export const COMMENT_REPORT_REASON_VALUES = ['spam', 'harassment', 'off_topic', 'other'];
/**
 * One open report per reader per comment — the unique index on `(commentId, reporterId)` is what
 * enforces "a reader may report a given comment only once"
 * (specs/community-moderation/spec.md), not application logic re-checked on every insert.
 *
 * `resolvedAt`/`resolvedBy` are set together, either by a comment's removal (in the same
 * transaction as that status change) or by a standalone dismiss action — never independently, and
 * never cleared once set: restoring a removed comment does not reopen the reports its removal
 * resolved (design.md - Decision 8, "Restoring a previously removed comment does not reopen the
 * reports that removal resolved"). `resolvedBy` is nullable because the row itself is never
 * deleted or reset — only ever created unresolved and, at most once, resolved.
 *
 * Both references cascade. A deleted comment's reports are meaningless, and a reporter's identity
 * is exactly what the unique index needs to exist for the constraint to mean anything.
 */
export const commentReports = mysqlTable('comment_reports', {
    id: char('id', { length: 36 }).primaryKey().$defaultFn(newId),
    commentId: char('comment_id', { length: 36 })
        .notNull()
        .references(() => comments.id, { onDelete: 'cascade' }),
    reporterId: char('reporter_id', { length: 36 })
        .notNull()
        .references(() => readers.id, { onDelete: 'cascade' }),
    reason: mysqlEnum('reason', COMMENT_REPORT_REASON_VALUES).notNull(),
    note: text('note'),
    createdAt: datetime('created_at', { fsp: 3 }).notNull().default(sql `CURRENT_TIMESTAMP(3)`),
    resolvedAt: datetime('resolved_at', { fsp: 3 }),
    resolvedBy: char('resolved_by', { length: 36 }).references(() => users.id),
    // Replaces the Postgres partial index `comment_reports_open_idx ... WHERE resolved_at IS
    // NULL` (MySQL has no partial index) — see
    // openspec/changes/migrate-postgres-to-mysql/design.md, "the one partial index becomes a
    // stored generated column". Generated from `resolvedAt` alone, deliberately not from
    // `commentId`: MySQL/InnoDB rejects a generated column whose expression reads a column that
    // is itself the base of a cascading foreign key (`commentId` cascades on comment delete) —
    // confirmed against a live MySQL 8 instance while implementing this, where the natural
    // `case when resolved_at is null then comment_id end` design failed to install with
    // `ERROR 1215 Cannot add foreign key constraint`. A boolean flag has no such dependency, and
    // the composite index below (`isOpen` leading) serves `moderation.repository.ts`'s
    // open-report aggregate (`WHERE resolved_at IS NULL GROUP BY comment_id`) exactly as
    // selectively as the partial index did.
    // No `.notNull()` here even though the expression can never actually produce NULL (`IS NULL`
    // always returns 0/1) — MariaDB's grammar rejects `NOT NULL` on a `STORED` generated column
    // outright (`ER_PARSE_ERROR` right after `STORED`), unlike MySQL 8 which accepts it.
    isOpen: boolean('is_open').generatedAlwaysAs(sql `(\`resolved_at\` is null)`, { mode: 'stored' }),
}, (table) => ({
    commentReporterUnique: uniqueIndex('comment_reports_comment_reporter_unique').on(table.commentId, table.reporterId),
    openReportsIdx: index('comment_reports_open_idx').on(table.isOpen, table.commentId),
}));
