import { sql } from 'drizzle-orm';
import { index, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { app } from './schema';
import { users } from './users';
import { readers } from './readers';
import { comments } from './engagement';

export const moderationTargetType = app.enum('moderation_target_type', ['comment', 'reader']);

/** `comment_reports_dismissed` is its own action, distinct from `comment_removed` — "this comment
 *  stays up despite being reported" is a decision worth its own record
 *  (design.md - Decision 8). */
export const moderationAction = app.enum('moderation_action', [
  'comment_removed',
  'comment_restored',
  'comment_reports_dismissed',
  'reader_muted',
  'reader_unmuted',
  'reader_banned',
  'reader_unbanned',
]);

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
export const moderationActions = app.table(
  'moderation_actions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    actorId: uuid('actor_id')
      .notNull()
      .references(() => users.id),
    targetType: moderationTargetType('target_type').notNull(),
    targetId: uuid('target_id').notNull(),
    action: moderationAction('action').notNull(),
    reason: text('reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    // Per-target history: "has this comment or reader been moderated before, and how".
    targetHistoryIdx: index('moderation_actions_target_history_idx').on(
      table.targetType,
      table.targetId,
      table.createdAt,
    ),
    // The queue read: every action, newest first, regardless of target.
    createdAtIdx: index('moderation_actions_created_at_idx').on(table.createdAt),
  }),
);

export const commentReportReason = app.enum('comment_report_reason', ['spam', 'harassment', 'off_topic', 'other']);

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
export const commentReports = app.table(
  'comment_reports',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    commentId: uuid('comment_id')
      .notNull()
      .references(() => comments.id, { onDelete: 'cascade' }),
    reporterId: uuid('reporter_id')
      .notNull()
      .references(() => readers.id, { onDelete: 'cascade' }),
    reason: commentReportReason('reason').notNull(),
    note: text('note'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    resolvedBy: uuid('resolved_by').references(() => users.id),
  },
  (table) => ({
    commentReporterUnique: uniqueIndex('comment_reports_comment_reporter_unique').on(table.commentId, table.reporterId),
    // Sized for exactly what the queue reads on every load: "does this comment have any
    // unresolved reports, and how many" — a partial index over only the unresolved rows, rather
    // than the full table, since a comment's resolved reports never factor into that question
    // again (design.md - Decision 8).
    openReportsIdx: index('comment_reports_open_idx')
      .on(table.commentId)
      .where(sql`${table.resolvedAt} is null`),
  }),
);
