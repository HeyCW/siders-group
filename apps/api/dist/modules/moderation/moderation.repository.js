import { and, asc, count, desc, eq, gt, isNull, like, or, sql } from 'drizzle-orm';
import { articles, comments, commentReports, moderationActions, newId, readers, users, } from '@siders/db';
/**
 * The open-report aggregate, computed once here and left-joined into every comment-queue read
 * rather than expressed as a `GROUP BY` over the joined query — a `LEFT JOIN` to a pre-aggregated
 * subquery keeps every other join in the query at its natural one-row-per-comment cardinality,
 * the same shape `readerRowSelect`'s own `commentCountSubquery` already established for the
 * reader list's comment count.
 *
 * Scoped to unresolved reports at the subquery level via `.where()`, not inside `FILTER` clauses
 * on the aggregates (MySQL has no `FILTER` clause in any case) — filtered on `isOpen`, the stored
 * generated column `packages/db/src/schema/moderation.ts` replaces the Postgres partial index
 * with, rather than on `resolvedAt is null` directly, so `comment_reports_open_idx`'s composite
 * `(isOpen, commentId)` index is the one that actually serves this scan
 * (openspec/changes/migrate-postgres-to-mysql/design.md - "the one partial index becomes a
 * stored generated column"). A comment whose reports are all resolved simply produces no row
 * here, and falls to the `LEFT JOIN`'s `NULL`, which every caller already reads as "no open
 * reports".
 *
 * `array_agg(distinct reason::text)` has no MySQL equivalent — MySQL has no array type.
 * `GROUP_CONCAT(DISTINCT ... SEPARATOR ',')` returns one comma-joined string instead, decoded
 * back into `CommentReportReason[]` in `toReportReasons` below rather than at the SQL layer,
 * mirroring how `openReportCount`'s `bigint` was already coerced in JS, not SQL.
 */
function reportAggregateSubquery(db) {
    return db
        .select({
        commentId: commentReports.commentId,
        // `.mapWith(Number)` because `count(*)` is `bigint`, and the driver returns a `bigint`
        // aggregate as a string to avoid precision loss (`supportBigNumbers` in
        // `packages/db/src/client.ts`) — every other aggregate in this repo coerces the same way
        // (`analytics.repository.ts`, and `commentCount` in `readerRowSelect` below).
        openReportCount: sql `count(*)`.mapWith(Number).as('open_report_count'),
        reportReasons: sql `group_concat(distinct ${commentReports.reason} separator ',')`
            .mapWith(toReportReasons)
            .as('report_reasons'),
    })
        .from(commentReports)
        .where(eq(commentReports.isOpen, true))
        .groupBy(commentReports.commentId)
        .as('report_agg');
}
/** `group_concat`'s `NULL` (no reports) and `''` (defensive) both mean "no reasons" — an actual
 *  reason value is never an empty string (`CommentReportReason` is a fixed enum), so this can't
 *  misread a real reason as absent. */
function toReportReasons(raw) {
    if (raw === null || raw === '')
        return [];
    return raw.split(',');
}
function commentQueueSelectColumns(reportAgg) {
    return {
        id: comments.id,
        body: comments.body,
        status: comments.status,
        articleId: comments.articleId,
        articleTitle: articles.title,
        articleSlug: articles.slug,
        authorName: readers.name,
        createdAt: comments.createdAt,
        // Projected directly, not re-wrapped in a `sql` template — wrapping an already-decoded
        // column back in `sql\`${...}\`` discards the decoder (`.mapWith(Number)` above) that makes
        // it a `number` instead of the driver's raw string.
        openReportCount: reportAgg.openReportCount,
        reportReasons: reportAgg.reportReasons,
    };
}
function commentQueueBaseQuery(db, reportAgg) {
    return db
        .select(commentQueueSelectColumns(reportAgg))
        .from(comments)
        .innerJoin(articles, eq(articles.id, comments.articleId))
        .innerJoin(readers, eq(readers.id, comments.readerId))
        .leftJoin(reportAgg, eq(reportAgg.commentId, comments.id));
}
/** `condition` is optional and combined internally — `.where()` is always called exactly once
 *  here, with `undefined` when there is nothing to filter on, rather than being called
 *  conditionally by each caller. A ternary between a query builder that has been through
 *  `.where()` and one that has not resolves, in Drizzle's types, to a type that can no longer be
 *  chained or awaited as the query it actually is — every caller below composes its own
 *  condition and passes it in once instead. */
function readerRowSelect(db, condition) {
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
        commentCount: sql `coalesce(${commentCountSubquery.commentCount}, 0)`.mapWith(Number),
        createdAt: readers.createdAt,
    })
        .from(readers)
        .leftJoin(commentCountSubquery, eq(commentCountSubquery.readerId, readers.id))
        .where(condition);
}
export function createModerationRepository(db) {
    async function commentQueueRow(executor, id) {
        const reportAgg = reportAggregateSubquery(executor);
        const [row] = await commentQueueBaseQuery(executor, reportAgg).where(eq(comments.id, id)).limit(1);
        return row ?? null;
    }
    async function insertActionLog(tx, targetType, targetId, entries) {
        if (entries.length === 0)
            return;
        await tx.insert(moderationActions).values(entries.map((entry) => ({
            actorId: entry.actorId,
            targetType,
            targetId,
            action: entry.action,
            reason: entry.reason,
        })));
    }
    /** `resolvedAt`/`resolvedBy` are only ever set, never cleared — a comment's earlier removal
     *  resolving its reports is not undone by a later restore (design.md - Decision 8). Resolves to
     *  the number of reports actually resolved, so `dismissReports` can answer not-found when that
     *  number is zero without a separate existence check. */
    async function resolveOpenReports(tx, commentId, resolvedBy) {
        const [result] = await tx
            .update(commentReports)
            .set({ resolvedAt: new Date(), resolvedBy })
            .where(and(eq(commentReports.commentId, commentId), isNull(commentReports.resolvedAt)));
        return result.affectedRows;
    }
    return {
        findCommentById: (id) => commentQueueRow(db, id),
        async listCommentQueue(filter) {
            const reportAgg = reportAggregateSubquery(db);
            const conditions = [];
            if (filter.status === 'visible' || filter.status === 'removed') {
                conditions.push(eq(comments.status, filter.status));
            }
            if (filter.cursor) {
                // The tuple comparison the design specifies (design.md - Decision 4): strictly after the
                // cursor's position in the same `(created_at desc, id desc)` order the query returns.
                conditions.push(sql `(${comments.createdAt}, ${comments.id}) < (${filter.cursor.createdAt}, ${filter.cursor.id})`);
            }
            if (filter.status === 'reported') {
                // The join is a `LEFT JOIN`, so an unreported comment's aggregate row is absent and its
                // columns read as `NULL` — `coalesce` is what keeps that comment out of this filter
                // rather than passing a `NULL > 0` comparison that Postgres evaluates to `NULL` (neither
                // true nor excluded by a naive `WHERE`, which would silently admit every unreported
                // comment too). Referencing `reportAgg.openReportCount` rather than a bare
                // `open_report_count` identifier keeps this tied to the actual subquery column instead
                // of a name that only happens to be unambiguous today.
                conditions.push(gt(sql `coalesce(${reportAgg.openReportCount}, 0)`, 0));
            }
            // One extra row fetched beyond `limit` — its presence, not its content, is the signal that
            // a following page exists. Never returned to the caller.
            const rows = await commentQueueBaseQuery(db, reportAgg)
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
                const [updateResult] = await tx.update(comments).set({ status }).where(eq(comments.id, id));
                if (updateResult.affectedRows === 0)
                    throw new Error('comment missing immediately before moderation update');
                // Only removal resolves reports — restoring a comment never reopens ones its earlier
                // removal already closed (design.md - Decision 8, "Restoring a comment does not reopen
                // resolved reports").
                if (status === 'removed') {
                    await resolveOpenReports(tx, id, logEntry.actorId);
                }
                await insertActionLog(tx, 'comment', id, [logEntry]);
                const row = await commentQueueRow(tx, id);
                if (!row)
                    throw new Error('comment missing immediately after moderation update');
                return row;
            });
        },
        async dismissReports(commentId, resolvedBy, logEntry) {
            return db.transaction(async (tx) => {
                const resolvedCount = await resolveOpenReports(tx, commentId, resolvedBy);
                if (resolvedCount === 0)
                    return null;
                await insertActionLog(tx, 'comment', commentId, [logEntry]);
                const row = await commentQueueRow(tx, commentId);
                if (!row)
                    throw new Error('comment missing immediately after dismissing its reports');
                return row;
            });
        },
        async createReport(commentId, reporterId, reason, note) {
            const id = newId();
            await db.insert(commentReports).values({ id, commentId, reporterId, reason, note });
            const [row] = await db
                .select({
                id: commentReports.id,
                commentId: commentReports.commentId,
                reason: commentReports.reason,
                note: commentReports.note,
                createdAt: commentReports.createdAt,
            })
                .from(commentReports)
                .where(eq(commentReports.id, id))
                .limit(1);
            if (!row)
                throw new Error('report missing immediately after insert');
            return row;
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
            const conditions = [];
            if (filter.status !== 'all')
                conditions.push(eq(readers.status, filter.status));
            if (filter.search) {
                // `ilike` has no MySQL equivalent; `like` is case-insensitive here for free because
                // every column in this schema uses the `utf8mb4_0900_ai_ci` collation
                // (openspec/changes/migrate-postgres-to-mysql/design.md). `%`/`_`/`\` are `LIKE`
                // metacharacters — escape any the caller typed literally, or a search for e.g. `50%_off`
                // would silently become a wildcard match instead of a literal one.
                const escaped = filter.search.replace(/[\\%_]/g, '\\$&');
                const term = `%${escaped}%`;
                conditions.push(or(like(readers.name, term), like(readers.email, term)));
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
                const [updateResult] = await tx.update(readers).set(patch).where(eq(readers.id, id));
                if (updateResult.affectedRows === 0)
                    throw new Error('reader missing immediately before moderation update');
                await insertActionLog(tx, 'reader', id, logEntries);
                const [row] = await readerRowSelect(tx, eq(readers.id, id));
                if (!row)
                    throw new Error('reader missing immediately after moderation update');
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
