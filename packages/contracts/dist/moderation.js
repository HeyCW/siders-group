import { z } from 'zod';
/** Matches `packages/db/src/schema/moderation.ts`'s `moderation_action` enum exactly — one value
 *  per action a permitted caller can take. */
export const MODERATION_ACTIONS = [
    'comment_removed',
    'comment_restored',
    'comment_reports_dismissed',
    'reader_muted',
    'reader_unmuted',
    'reader_banned',
    'reader_unbanned',
];
export const moderationActionSchema = z.enum(MODERATION_ACTIONS);
/** `reason` is bounded the same way a comment body is — a moderation note, not a second article. */
const MODERATION_REASON_MAX_LENGTH = 500;
const moderationReasonSchema = z.string().trim().min(1).max(MODERATION_REASON_MAX_LENGTH).optional();
export const DEFAULT_COMMENT_QUEUE_LIMIT = 20;
export const MAX_COMMENT_QUEUE_LIMIT = 100;
export const COMMENT_QUEUE_STATUS_FILTERS = ['visible', 'removed', 'all', 'reported'];
export const commentQueueStatusFilterSchema = z.enum(COMMENT_QUEUE_STATUS_FILTERS);
/** The status a comment can actually be set *to* — `all` and `reported` are read-side filter
 *  values, never a value a moderation action assigns. */
export const MODERATION_COMMENT_STATUSES = ['visible', 'removed'];
export const moderationCommentStatusSchema = z.enum(MODERATION_COMMENT_STATUSES);
/** Matches `packages/db/src/schema/moderation.ts`'s `comment_report_reason` enum exactly. */
export const COMMENT_REPORT_REASONS = ['spam', 'harassment', 'off_topic', 'other'];
export const commentReportReasonSchema = z.enum(COMMENT_REPORT_REASONS);
/**
 * No `offset` — the queue is keyset-paginated (design.md - Decision 4). `cursor` is opaque to
 * the caller: it is whatever `nextCursor` the previous page returned, echoed back verbatim, never
 * constructed by the client.
 */
export const commentQueueQuerySchema = z.object({
    status: commentQueueStatusFilterSchema.default('all'),
    cursor: z.string().min(1).optional(),
    limit: z.coerce
        .number()
        .int()
        .min(1)
        .default(DEFAULT_COMMENT_QUEUE_LIMIT)
        .transform((n) => Math.min(n, MAX_COMMENT_QUEUE_LIMIT)),
});
/** One queue row: the comment plus the article and author context a moderator needs to judge it
 *  without a second lookup (specs/community-moderation/spec.md - "Each row carries its article
 *  and author context"). No author email or reader id — the same restraint
 *  `engagement.mapper.ts`'s public `CommentResponse` already applies. */
export const commentQueueRowSchema = z.object({
    id: z.string().uuid(),
    body: z.string(),
    status: moderationCommentStatusSchema,
    articleId: z.string().uuid(),
    articleTitle: z.string(),
    articleSlug: z.string(),
    authorName: z.string(),
    createdAt: z.string().datetime(),
    // Present only when the comment carries at least one unresolved report
    // (specs/community-moderation/spec.md - "A comment's open report count and reasons are never
    // themselves an action"). A comment with zero open reports carries neither field, rather than
    // `openReportCount: 0` — the absence of a report is not itself information a moderator reads.
    openReportCount: z.number().int().positive().optional(),
    reportReasons: z.array(commentReportReasonSchema).min(1).optional(),
});
/** `nextCursor` is `null` once the queue has no further page — the same shape a bare-array
 *  `hasMore` signal serves elsewhere, made explicit here because there is no `.length === limit`
 *  trick to fall back on with a keyset page that legitimately returns fewer than `limit` rows for
 *  reasons other than reaching the end. */
export const commentQueueResponseSchema = z.object({
    items: z.array(commentQueueRowSchema),
    nextCursor: z.string().nullable(),
});
/** `.strict()`, matching `commentCreateRequestSchema`'s convention — the interesting rejections
 *  are fields a caller might invent, like a target's `articleId` (the path already names the
 *  comment) or an `actorId` (the session already names the actor). */
export const commentModerateRequestSchema = z
    .object({
    status: moderationCommentStatusSchema,
    reason: moderationReasonSchema,
})
    .strict();
const COMMENT_REPORT_NOTE_MAX_LENGTH = 500;
/** `.strict()` — a reader files a report against a comment named by the path, so `commentId` and
 *  `reporterId` are exactly the fields a caller might invent and exactly the fields this schema
 *  refuses, matching `commentCreateRequestSchema`'s convention. */
export const commentReportRequestSchema = z
    .object({
    reason: commentReportReasonSchema,
    note: z.string().trim().min(1).max(COMMENT_REPORT_NOTE_MAX_LENGTH).optional(),
})
    .strict();
/** No `reporterId` — a report is visible only to the reporting reader as confirmation of their
 *  own submission, never surfaced to anyone else, so there is no audience for it to identify
 *  itself to. */
export const commentReportResponseSchema = z.object({
    id: z.string().uuid(),
    commentId: z.string().uuid(),
    reason: commentReportReasonSchema,
    note: z.string().nullable(),
    createdAt: z.string().datetime(),
});
/** `.strict()`, matching `commentModerateRequestSchema` — a reason is the only field a dismiss
 *  action accepts, since the comment's `status` is explicitly untouched by this action
 *  (specs/community-moderation/spec.md - "A permitted caller can dismiss a comment's open reports
 *  without removing it"). */
export const commentReportsDismissRequestSchema = z
    .object({
    reason: moderationReasonSchema,
})
    .strict();
export const DEFAULT_READER_QUEUE_LIMIT = 20;
export const MAX_READER_QUEUE_LIMIT = 100;
export const READER_QUEUE_STATUS_FILTERS = ['active', 'banned', 'all'];
export const readerQueueStatusFilterSchema = z.enum(READER_QUEUE_STATUS_FILTERS);
/**
 * Offset-paginated, unlike the comment queue — this list has no equivalent of a comment silently
 * skipped past a page boundary being a real harm; a reader missing from one page of a search is
 * just re-found by scrolling or re-searching (design.md - Decision 4 scopes keyset paging to the
 * comment queue specifically).
 */
export const readerQueueQuerySchema = z.object({
    search: z.string().trim().min(1).optional(),
    status: readerQueueStatusFilterSchema.default('all'),
    limit: z.coerce
        .number()
        .int()
        .min(1)
        .default(DEFAULT_READER_QUEUE_LIMIT)
        .transform((n) => Math.min(n, MAX_READER_QUEUE_LIMIT)),
    offset: z.coerce.number().int().min(0).default(0),
});
/** `commentCount` is every comment this reader has ever posted, regardless of status — total
 *  activity is the signal a moderator judging a repeat offender needs, not the subset currently
 *  visible to the public. */
export const readerQueueRowSchema = z.object({
    id: z.string().uuid(),
    name: z.string(),
    email: z.string().email(),
    avatarUrl: z.string().nullable(),
    status: z.enum(['active', 'banned']),
    mutedUntil: z.string().datetime().nullable(),
    commentCount: z.number().int().nonnegative(),
    createdAt: z.string().datetime(),
});
/** A bare array, matching `/articles` and `/admin/partners` rather than an envelope — this list
 *  is offset-paginated, so a full page is already the caller's signal that more may exist. */
export const readerQueueResponseSchema = z.array(readerQueueRowSchema);
/**
 * Both axes in one request because the endpoint governs both (tasks.md - 3.4): `status` bans or
 * unbans, `mutedUntil` mutes (a future instant) or unmutes (`null`). `.strict()`, and at least one
 * of the two SHALL be present — a request naming neither has no action to perform, and a
 * `reason` with nothing to attach it to is not a request this endpoint accepts.
 *
 * Whether a submitted `mutedUntil` is actually in the future is a service-layer check against a
 * shared `now`, not a schema refinement — the same reasoning `engagement`'s article-visibility
 * gate follows: a schema that embeds `new Date()` at parse time is untestable without faking the
 * clock, where a service that takes `now` as a parameter is not.
 */
export const readerModerateRequestSchema = z
    .object({
    status: z.enum(['active', 'banned']).optional(),
    mutedUntil: z.string().datetime().nullable().optional(),
    reason: moderationReasonSchema,
})
    .strict()
    .refine((body) => body.status !== undefined || body.mutedUntil !== undefined, {
    message: 'At least one of status or mutedUntil is required',
});
/** The per-target action history shape — one row per past action, oldest information never
 *  overwritten by a newer one (specs/community-moderation/spec.md - "A record persists after
 *  later actions on the same target"). `actorName` rather than a bare `actorId`, so a moderator
 *  reading history does not need a second lookup to know who acted. */
export const moderationActionResponseSchema = z.object({
    id: z.string().uuid(),
    actorName: z.string(),
    targetType: z.enum(['comment', 'reader']),
    targetId: z.string().uuid(),
    action: moderationActionSchema,
    reason: z.string().nullable(),
    createdAt: z.string().datetime(),
});
