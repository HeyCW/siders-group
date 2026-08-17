import { and, asc, count, desc, eq, gt, ilike, isNull, or, sql, type SQL } from 'drizzle-orm';
import {
  articles,
  comments,
  commentReports,
  moderationActions,
  readers,
  users,
  type Database,
} from '@siders/db';
import type { CommentReportReason, ModerationAction } from '@siders/contracts';

export type CommentModerationStatus = 'visible' | 'removed';
export type ReaderModerationStatus = 'active' | 'banned';

/** Either a plain `Database` or the executor a transaction callback receives — the same split
 *  `article.repository.ts` draws, needed here because several writes below re-read the row they
 *  just wrote inside the same transaction rather than after it commits. */
type Executor = Database | Parameters<Parameters<Database['transaction']>[0]>[0];

export interface CommentQueueFilter {
  status: 'visible' | 'removed' | 'all' | 'reported';
  /** Decoded from the caller's opaque cursor string — `undefined` for the first page. */
  cursor: { createdAt: Date; id: string } | undefined;
  limit: number;
}

export interface CommentQueueRow {
  id: string;
  body: string;
  status: CommentModerationStatus;
  articleId: string;
  articleTitle: string;
  articleSlug: string;
  authorName: string;
  createdAt: Date;
  /** `null` (not zero) when the comment carries no unresolved reports — see the mapper for how
   *  this becomes "the field is simply absent" in the contract shape. */
  openReportCount: number | null;
  reportReasons: CommentReportReason[] | null;
}

/** One page, plus whether a following page exists — the repository's boundary is exactly what
 *  the cursor needs, encoding into an opaque string is the service's job (it owns no other
 *  domain knowledge, but keeping cursor *encoding* out of the query layer keeps this file
 *  ignorant of the string format, matching `engagement.repository.ts`'s split of concerns). */
export interface CommentQueuePage {
  items: CommentQueueRow[];
  /** The last row's `(createdAt, id)` — `undefined` when this page reached the end. */
  nextCursorSource: { createdAt: Date; id: string } | undefined;
}

export interface ReaderQueueFilter {
  search: string | undefined;
  status: 'active' | 'banned' | 'all';
  limit: number;
  offset: number;
}

export interface ReaderQueueRow {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  status: ReaderModerationStatus;
  mutedUntil: Date | null;
  commentCount: number;
  createdAt: Date;
}

export interface ModerationActionInput {
  actorId: string;
  action: ModerationAction;
  reason: string | null;
}

export interface ModerationActionRow {
  id: string;
  actorName: string;
  targetType: 'comment' | 'reader';
  targetId: string;
  action: ModerationAction;
  reason: string | null;
  createdAt: Date;
}

export interface CommentReportRow {
  id: string;
  commentId: string;
  reason: CommentReportReason;
  note: string | null;
  createdAt: Date;
}

/**
 * The report-count aggregate, computed once here and left-joined into every comment-queue read
 * rather than expressed as a `GROUP BY` over the joined query — a `LEFT JOIN` to a pre-aggregated
 * subquery keeps every other join in the query at its natural one-row-per-comment cardinality,
 * the same shape `readerRowSelect`'s own `commentCountSubquery` already established for the
 * reader list's comment count.
 */
function reportAggregateSubquery(db: Executor) {
  return db
    .select({
      commentId: commentReports.commentId,
      openReportCount: sql<number>`count(*) filter (where ${commentReports.resolvedAt} is null)`.as('open_report_count'),
      // `array_agg` over an empty filtered set returns a one-element array containing `null`,
      // not an empty array or `null` itself — `coalesce` alone would not catch that, so the
      // `filter` clause (excluding resolved reports) is what keeps a fully-resolved comment from
      // reporting a phantom `[null]` reason list.
      reportReasons: sql<CommentReportReason[] | null>`array_agg(distinct ${commentReports.reason}) filter (where ${commentReports.resolvedAt} is null)`.as(
        'report_reasons',
      ),
    })
    .from(commentReports)
    .groupBy(commentReports.commentId)
    .as('report_agg');
}

const COMMENT_QUEUE_SELECT_COLUMNS = (reportAgg: ReturnType<typeof reportAggregateSubquery>) => ({
  id: comments.id,
  body: comments.body,
  status: comments.status,
  articleId: comments.articleId,
  articleTitle: articles.title,
  articleSlug: articles.slug,
  authorName: readers.name,
  createdAt: comments.createdAt,
  openReportCount: sql<number | null>`${reportAgg.openReportCount}`,
  reportReasons: sql<CommentReportReason[] | null>`${reportAgg.reportReasons}`,
});

function commentQueueBaseQuery(db: Executor) {
  const reportAgg = reportAggregateSubquery(db);
  return db
    .select(COMMENT_QUEUE_SELECT_COLUMNS(reportAgg))
    .from(comments)
    .innerJoin(articles, eq(articles.id, comments.articleId))
    .innerJoin(readers, eq(readers.id, comments.readerId))
    .leftJoin(reportAgg, eq(reportAgg.commentId, comments.id));
}

export interface ModerationRepository {
  findCommentById(id: string): Promise<CommentQueueRow | null>;
  listCommentQueue(filter: CommentQueueFilter): Promise<CommentQueuePage>;
  /** Sets the comment's status and records the action in one transaction — the record exists if
   *  and only if the status change was applied (specs/community-moderation/spec.md - "The
   *  moderation record is written atomically with the state change"). Removing a comment
   *  additionally resolves every one of its open reports in the same transaction; restoring one
   *  does not reopen them (design.md - Decision 8). */
  setCommentStatus(
    id: string,
    status: CommentModerationStatus,
    logEntry: ModerationActionInput,
  ): Promise<CommentQueueRow>;
  /** Resolves every open report against a comment and records the dismissal in one transaction.
   *  Resolves to `null` when the comment has no open report to dismiss, so the service can answer
   *  not-found without a separate existence check racing this one. */
  dismissReports(commentId: string, resolvedBy: string, logEntry: ModerationActionInput): Promise<CommentQueueRow | null>;
  /** Lets a unique-constraint violation on `(commentId, reporterId)` propagate as a raw driver
   *  error — the service translates it via `isUniqueViolation`, the same split
   *  `engagement.repository.ts`'s `toggleLike` draws between "the database enforces it" and "the
   *  caller gets a typed error". */
  createReport(commentId: string, reporterId: string, reason: CommentReportReason, note: string | null): Promise<CommentReportRow>;

  findReaderById(id: string): Promise<{ id: string; status: ReaderModerationStatus; mutedUntil: Date | null } | null>;
  getReaderRow(id: string): Promise<ReaderQueueRow | null>;
  listReaders(filter: ReaderQueueFilter): Promise<ReaderQueueRow[]>;
  /**
   * Applies the reader patch and records every entry in `logEntries` in one transaction — one
   * `UPDATE`, one or two `INSERT`s (ban+mute submitted together produce two), all committed or
   * none of them (specs/community-moderation/spec.md - "The moderation record is written
   * atomically with the state change"). Callers pass zero, one, or two log entries depending on
   * how many transitions the patch actually represents — determined by the service, which is the
   * one place that knows what "before" looked like.
   */
  updateReader(
    id: string,
    patch: { status?: ReaderModerationStatus; mutedUntil?: Date | null },
    logEntries: ModerationActionInput[],
  ): Promise<ReaderQueueRow>;

  /** Every past action against one target, newest first — not wired to a route in this change
   *  (no spec scenario requires reading it back over HTTP), kept for the log's own stated purpose
   *  ("so a wrong call is reviewable") and exercised directly in tests. */
  listActionsForTarget(targetType: 'comment' | 'reader', targetId: string): Promise<ModerationActionRow[]>;
}

/** `condition` is optional and combined internally — `.where()` is always called exactly once
 *  here, with `undefined` when there is nothing to filter on, rather than being called
 *  conditionally by each caller. A ternary between a query builder that has been through
 *  `.where()` and one that has not resolves, in Drizzle's types, to a type that can no longer be
 *  chained or awaited as the query it actually is — every caller below composes its own
 *  condition and passes it in once instead. */
function readerRowSelect(db: Executor, condition?: SQL) {
  const commentCountSubquery = db
    .select({ readerId: comments.readerId, commentCount: count().as('comment_count') })
    .from(comments)
    .groupBy(comments.readerId)
    .as('comment_counts');

  return db
    .select({
      id: readers.id,
      name: readers.name,
      email: readers.email,
      avatarUrl: readers.avatarUrl,
      status: readers.status,
      mutedUntil: readers.mutedUntil,
      commentCount: sql<number>`coalesce(${commentCountSubquery.commentCount}, 0)`.mapWith(Number),
      createdAt: readers.createdAt,
    })
    .from(readers)
    .leftJoin(commentCountSubquery, eq(commentCountSubquery.readerId, readers.id))
    .where(condition);
}

export function createModerationRepository(db: Database): ModerationRepository {
  async function commentQueueRow(executor: Executor, id: string): Promise<CommentQueueRow | null> {
    const [row] = await commentQueueBaseQuery(executor).where(eq(comments.id, id)).limit(1);
    return row ?? null;
  }

  async function insertActionLog(
    tx: Executor,
    targetType: 'comment' | 'reader',
    targetId: string,
    entries: ModerationActionInput[],
  ): Promise<void> {
    if (entries.length === 0) return;
    await tx.insert(moderationActions).values(
      entries.map((entry) => ({
        actorId: entry.actorId,
        targetType,
        targetId,
        action: entry.action,
        reason: entry.reason,
      })),
    );
  }

  /** `resolvedAt`/`resolvedBy` are only ever set, never cleared — a comment's earlier removal
   *  resolving its reports is not undone by a later restore (design.md - Decision 8). Resolves to
   *  the number of reports actually resolved, so `dismissReports` can answer not-found when that
   *  number is zero without a separate existence check. */
  async function resolveOpenReports(tx: Executor, commentId: string, resolvedBy: string): Promise<number> {
    const resolved = await tx
      .update(commentReports)
      .set({ resolvedAt: new Date(), resolvedBy })
      .where(and(eq(commentReports.commentId, commentId), isNull(commentReports.resolvedAt)))
      .returning({ id: commentReports.id });
    return resolved.length;
  }

  return {
    findCommentById: (id) => commentQueueRow(db, id),

    async listCommentQueue(filter) {
      const conditions: SQL[] = [];
      if (filter.status === 'visible' || filter.status === 'removed') {
        conditions.push(eq(comments.status, filter.status));
      }
      if (filter.cursor) {
        // The tuple comparison the design specifies (design.md - Decision 4): strictly after the
        // cursor's position in the same `(created_at desc, id desc)` order the query returns.
        conditions.push(
          sql`(${comments.createdAt}, ${comments.id}) < (${filter.cursor.createdAt}, ${filter.cursor.id})`,
        );
      }
      if (filter.status === 'reported') {
        // The join is a `LEFT JOIN`, so an unreported comment's aggregate columns are `NULL` —
        // `coalesce` is what keeps that comment out of this filter rather than passing a
        // `NULL > 0` comparison that Postgres evaluates to `NULL` (neither true nor excluded by
        // a naive `WHERE`, which would silently admit every unreported comment too).
        conditions.push(gt(sql`coalesce(open_report_count, 0)`, 0));
      }

      // One extra row fetched beyond `limit` — its presence, not its content, is the signal that
      // a following page exists. Never returned to the caller.
      const rows = await commentQueueBaseQuery(db)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(comments.createdAt), desc(comments.id))
        .limit(filter.limit + 1);

      const hasMore = rows.length > filter.limit;
      const items = hasMore ? rows.slice(0, filter.limit) : rows;
      const last = items[items.length - 1];
      return {
        items,
        nextCursorSource: hasMore && last ? { createdAt: last.createdAt, id: last.id } : undefined,
      };
    },

    async setCommentStatus(id, status, logEntry) {
      return db.transaction(async (tx) => {
        const [updated] = await tx
          .update(comments)
          .set({ status })
          .where(eq(comments.id, id))
          .returning({ id: comments.id });
        if (!updated) throw new Error('comment missing immediately before moderation update');

        // Only removal resolves reports — restoring a comment never reopens ones its earlier
        // removal already closed (design.md - Decision 8, "Restoring a comment does not reopen
        // resolved reports").
        if (status === 'removed') {
          await resolveOpenReports(tx, id, logEntry.actorId);
        }

        await insertActionLog(tx, 'comment', id, [logEntry]);

        const row = await commentQueueRow(tx, id);
        if (!row) throw new Error('comment missing immediately after moderation update');
        return row;
      });
    },

    async dismissReports(commentId, resolvedBy, logEntry) {
      return db.transaction(async (tx) => {
        const resolvedCount = await resolveOpenReports(tx, commentId, resolvedBy);
        if (resolvedCount === 0) return null;

        await insertActionLog(tx, 'comment', commentId, [logEntry]);

        const row = await commentQueueRow(tx, commentId);
        if (!row) throw new Error('comment missing immediately after dismissing its reports');
        return row;
      });
    },

    async createReport(commentId, reporterId, reason, note) {
      const [inserted] = await db
        .insert(commentReports)
        .values({ commentId, reporterId, reason, note })
        .returning({
          id: commentReports.id,
          commentId: commentReports.commentId,
          reason: commentReports.reason,
          note: commentReports.note,
          createdAt: commentReports.createdAt,
        });
      if (!inserted) throw new Error('report insert returned no row');
      return inserted;
    },

    async findReaderById(id) {
      const [row] = await db
        .select({ id: readers.id, status: readers.status, mutedUntil: readers.mutedUntil })
        .from(readers)
        .where(eq(readers.id, id))
        .limit(1);
      return row ?? null;
    },

    async getReaderRow(id) {
      const [row] = await readerRowSelect(db, eq(readers.id, id));
      return row ?? null;
    },

    listReaders(filter) {
      const conditions: SQL[] = [];
      if (filter.status !== 'all') conditions.push(eq(readers.status, filter.status));
      if (filter.search) {
        const term = `%${filter.search}%`;
        conditions.push(or(ilike(readers.name, term), ilike(readers.email, term)) as SQL);
      }

      return readerRowSelect(db, conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(asc(readers.name))
        .limit(filter.limit)
        .offset(filter.offset);
    },

    async updateReader(id, patch, logEntries) {
      return db.transaction(async (tx) => {
        // `patch` can legitimately be empty (a caller-side no-op is filtered before this is
        // called), but this function's own contract does not assume that — an empty `set()` is a
        // Drizzle error, so this always has at least one field by the time the service calls it.
        const [updated] = await tx.update(readers).set(patch).where(eq(readers.id, id)).returning({ id: readers.id });
        if (!updated) throw new Error('reader missing immediately before moderation update');

        await insertActionLog(tx, 'reader', id, logEntries);

        const [row] = await readerRowSelect(tx, eq(readers.id, id));
        if (!row) throw new Error('reader missing immediately after moderation update');
        return row;
      });
    },

    listActionsForTarget(targetType, targetId) {
      return db
        .select({
          id: moderationActions.id,
          actorName: users.name,
          targetType: moderationActions.targetType,
          targetId: moderationActions.targetId,
          action: moderationActions.action,
          reason: moderationActions.reason,
          createdAt: moderationActions.createdAt,
        })
        .from(moderationActions)
        .innerJoin(users, eq(users.id, moderationActions.actorId))
        .where(and(eq(moderationActions.targetType, targetType), eq(moderationActions.targetId, targetId)))
        .orderBy(desc(moderationActions.createdAt));
    },
  };
}
