import { z } from 'zod';
/** Matches `packages/db/src/schema/moderation.ts`'s `moderation_action` enum exactly — one value
 *  per action a permitted caller can take. */
export declare const MODERATION_ACTIONS: readonly ["comment_removed", "comment_restored", "comment_reports_dismissed", "reader_muted", "reader_unmuted", "reader_banned", "reader_unbanned"];
export declare const moderationActionSchema: z.ZodEnum<["comment_removed", "comment_restored", "comment_reports_dismissed", "reader_muted", "reader_unmuted", "reader_banned", "reader_unbanned"]>;
export type ModerationAction = z.infer<typeof moderationActionSchema>;
export declare const DEFAULT_COMMENT_QUEUE_LIMIT = 20;
export declare const MAX_COMMENT_QUEUE_LIMIT = 100;
export declare const COMMENT_QUEUE_STATUS_FILTERS: readonly ["visible", "removed", "all", "reported"];
export declare const commentQueueStatusFilterSchema: z.ZodEnum<["visible", "removed", "all", "reported"]>;
export type CommentQueueStatusFilter = z.infer<typeof commentQueueStatusFilterSchema>;
/** The status a comment can actually be set *to* — `all` and `reported` are read-side filter
 *  values, never a value a moderation action assigns. */
export declare const MODERATION_COMMENT_STATUSES: readonly ["visible", "removed"];
export declare const moderationCommentStatusSchema: z.ZodEnum<["visible", "removed"]>;
/** Matches `packages/db/src/schema/moderation.ts`'s `comment_report_reason` enum exactly. */
export declare const COMMENT_REPORT_REASONS: readonly ["spam", "harassment", "off_topic", "other"];
export declare const commentReportReasonSchema: z.ZodEnum<["spam", "harassment", "off_topic", "other"]>;
export type CommentReportReason = z.infer<typeof commentReportReasonSchema>;
/**
 * No `offset` — the queue is keyset-paginated (design.md - Decision 4). `cursor` is opaque to
 * the caller: it is whatever `nextCursor` the previous page returned, echoed back verbatim, never
 * constructed by the client.
 */
export declare const commentQueueQuerySchema: z.ZodObject<{
    status: z.ZodDefault<z.ZodEnum<["visible", "removed", "all", "reported"]>>;
    cursor: z.ZodOptional<z.ZodString>;
    limit: z.ZodEffects<z.ZodDefault<z.ZodNumber>, number, number | undefined>;
}, "strip", z.ZodTypeAny, {
    status: "all" | "visible" | "removed" | "reported";
    limit: number;
    cursor?: string | undefined;
}, {
    status?: "all" | "visible" | "removed" | "reported" | undefined;
    limit?: number | undefined;
    cursor?: string | undefined;
}>;
export type CommentQueueQuery = z.infer<typeof commentQueueQuerySchema>;
/** One queue row: the comment plus the article and author context a moderator needs to judge it
 *  without a second lookup (specs/community-moderation/spec.md - "Each row carries its article
 *  and author context"). No author email or reader id — the same restraint
 *  `engagement.mapper.ts`'s public `CommentResponse` already applies. */
export declare const commentQueueRowSchema: z.ZodObject<{
    id: z.ZodString;
    body: z.ZodString;
    status: z.ZodEnum<["visible", "removed"]>;
    articleId: z.ZodString;
    articleTitle: z.ZodString;
    articleSlug: z.ZodString;
    authorName: z.ZodString;
    createdAt: z.ZodString;
    openReportCount: z.ZodOptional<z.ZodNumber>;
    reportReasons: z.ZodOptional<z.ZodArray<z.ZodEnum<["spam", "harassment", "off_topic", "other"]>, "many">>;
}, "strip", z.ZodTypeAny, {
    status: "visible" | "removed";
    id: string;
    createdAt: string;
    authorName: string;
    body: string;
    articleId: string;
    articleTitle: string;
    articleSlug: string;
    openReportCount?: number | undefined;
    reportReasons?: ("spam" | "harassment" | "off_topic" | "other")[] | undefined;
}, {
    status: "visible" | "removed";
    id: string;
    createdAt: string;
    authorName: string;
    body: string;
    articleId: string;
    articleTitle: string;
    articleSlug: string;
    openReportCount?: number | undefined;
    reportReasons?: ("spam" | "harassment" | "off_topic" | "other")[] | undefined;
}>;
export type CommentQueueRow = z.infer<typeof commentQueueRowSchema>;
/** `nextCursor` is `null` once the queue has no further page — the same shape a bare-array
 *  `hasMore` signal serves elsewhere, made explicit here because there is no `.length === limit`
 *  trick to fall back on with a keyset page that legitimately returns fewer than `limit` rows for
 *  reasons other than reaching the end. */
export declare const commentQueueResponseSchema: z.ZodObject<{
    items: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        body: z.ZodString;
        status: z.ZodEnum<["visible", "removed"]>;
        articleId: z.ZodString;
        articleTitle: z.ZodString;
        articleSlug: z.ZodString;
        authorName: z.ZodString;
        createdAt: z.ZodString;
        openReportCount: z.ZodOptional<z.ZodNumber>;
        reportReasons: z.ZodOptional<z.ZodArray<z.ZodEnum<["spam", "harassment", "off_topic", "other"]>, "many">>;
    }, "strip", z.ZodTypeAny, {
        status: "visible" | "removed";
        id: string;
        createdAt: string;
        authorName: string;
        body: string;
        articleId: string;
        articleTitle: string;
        articleSlug: string;
        openReportCount?: number | undefined;
        reportReasons?: ("spam" | "harassment" | "off_topic" | "other")[] | undefined;
    }, {
        status: "visible" | "removed";
        id: string;
        createdAt: string;
        authorName: string;
        body: string;
        articleId: string;
        articleTitle: string;
        articleSlug: string;
        openReportCount?: number | undefined;
        reportReasons?: ("spam" | "harassment" | "off_topic" | "other")[] | undefined;
    }>, "many">;
    nextCursor: z.ZodNullable<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    items: {
        status: "visible" | "removed";
        id: string;
        createdAt: string;
        authorName: string;
        body: string;
        articleId: string;
        articleTitle: string;
        articleSlug: string;
        openReportCount?: number | undefined;
        reportReasons?: ("spam" | "harassment" | "off_topic" | "other")[] | undefined;
    }[];
    nextCursor: string | null;
}, {
    items: {
        status: "visible" | "removed";
        id: string;
        createdAt: string;
        authorName: string;
        body: string;
        articleId: string;
        articleTitle: string;
        articleSlug: string;
        openReportCount?: number | undefined;
        reportReasons?: ("spam" | "harassment" | "off_topic" | "other")[] | undefined;
    }[];
    nextCursor: string | null;
}>;
export type CommentQueueResponse = z.infer<typeof commentQueueResponseSchema>;
/** `.strict()`, matching `commentCreateRequestSchema`'s convention — the interesting rejections
 *  are fields a caller might invent, like a target's `articleId` (the path already names the
 *  comment) or an `actorId` (the session already names the actor). */
export declare const commentModerateRequestSchema: z.ZodObject<{
    status: z.ZodEnum<["visible", "removed"]>;
    reason: z.ZodOptional<z.ZodString>;
}, "strict", z.ZodTypeAny, {
    status: "visible" | "removed";
    reason?: string | undefined;
}, {
    status: "visible" | "removed";
    reason?: string | undefined;
}>;
export type CommentModerateRequest = z.infer<typeof commentModerateRequestSchema>;
/** `.strict()` — a reader files a report against a comment named by the path, so `commentId` and
 *  `reporterId` are exactly the fields a caller might invent and exactly the fields this schema
 *  refuses, matching `commentCreateRequestSchema`'s convention. */
export declare const commentReportRequestSchema: z.ZodObject<{
    reason: z.ZodEnum<["spam", "harassment", "off_topic", "other"]>;
    note: z.ZodOptional<z.ZodString>;
}, "strict", z.ZodTypeAny, {
    reason: "spam" | "harassment" | "off_topic" | "other";
    note?: string | undefined;
}, {
    reason: "spam" | "harassment" | "off_topic" | "other";
    note?: string | undefined;
}>;
export type CommentReportRequest = z.infer<typeof commentReportRequestSchema>;
/** No `reporterId` — a report is visible only to the reporting reader as confirmation of their
 *  own submission, never surfaced to anyone else, so there is no audience for it to identify
 *  itself to. */
export declare const commentReportResponseSchema: z.ZodObject<{
    id: z.ZodString;
    commentId: z.ZodString;
    reason: z.ZodEnum<["spam", "harassment", "off_topic", "other"]>;
    note: z.ZodNullable<z.ZodString>;
    createdAt: z.ZodString;
}, "strip", z.ZodTypeAny, {
    id: string;
    createdAt: string;
    reason: "spam" | "harassment" | "off_topic" | "other";
    note: string | null;
    commentId: string;
}, {
    id: string;
    createdAt: string;
    reason: "spam" | "harassment" | "off_topic" | "other";
    note: string | null;
    commentId: string;
}>;
export type CommentReportResponse = z.infer<typeof commentReportResponseSchema>;
/** `.strict()`, matching `commentModerateRequestSchema` — a reason is the only field a dismiss
 *  action accepts, since the comment's `status` is explicitly untouched by this action
 *  (specs/community-moderation/spec.md - "A permitted caller can dismiss a comment's open reports
 *  without removing it"). */
export declare const commentReportsDismissRequestSchema: z.ZodObject<{
    reason: z.ZodOptional<z.ZodString>;
}, "strict", z.ZodTypeAny, {
    reason?: string | undefined;
}, {
    reason?: string | undefined;
}>;
export type CommentReportsDismissRequest = z.infer<typeof commentReportsDismissRequestSchema>;
export declare const DEFAULT_READER_QUEUE_LIMIT = 20;
export declare const MAX_READER_QUEUE_LIMIT = 100;
export declare const READER_QUEUE_STATUS_FILTERS: readonly ["active", "banned", "all"];
export declare const readerQueueStatusFilterSchema: z.ZodEnum<["active", "banned", "all"]>;
export type ReaderQueueStatusFilter = z.infer<typeof readerQueueStatusFilterSchema>;
/**
 * Offset-paginated, unlike the comment queue — this list has no equivalent of a comment silently
 * skipped past a page boundary being a real harm; a reader missing from one page of a search is
 * just re-found by scrolling or re-searching (design.md - Decision 4 scopes keyset paging to the
 * comment queue specifically).
 */
export declare const readerQueueQuerySchema: z.ZodObject<{
    search: z.ZodOptional<z.ZodString>;
    status: z.ZodDefault<z.ZodEnum<["active", "banned", "all"]>>;
    limit: z.ZodEffects<z.ZodDefault<z.ZodNumber>, number, number | undefined>;
    offset: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    status: "active" | "banned" | "all";
    limit: number;
    offset: number;
    search?: string | undefined;
}, {
    status?: "active" | "banned" | "all" | undefined;
    limit?: number | undefined;
    offset?: number | undefined;
    search?: string | undefined;
}>;
export type ReaderQueueQuery = z.infer<typeof readerQueueQuerySchema>;
/** `commentCount` is every comment this reader has ever posted, regardless of status — total
 *  activity is the signal a moderator judging a repeat offender needs, not the subset currently
 *  visible to the public. */
export declare const readerQueueRowSchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    email: z.ZodString;
    avatarUrl: z.ZodNullable<z.ZodString>;
    status: z.ZodEnum<["active", "banned"]>;
    mutedUntil: z.ZodNullable<z.ZodString>;
    commentCount: z.ZodNumber;
    createdAt: z.ZodString;
}, "strip", z.ZodTypeAny, {
    name: string;
    status: "active" | "banned";
    id: string;
    createdAt: string;
    email: string;
    avatarUrl: string | null;
    commentCount: number;
    mutedUntil: string | null;
}, {
    name: string;
    status: "active" | "banned";
    id: string;
    createdAt: string;
    email: string;
    avatarUrl: string | null;
    commentCount: number;
    mutedUntil: string | null;
}>;
export type ReaderQueueRow = z.infer<typeof readerQueueRowSchema>;
/** A bare array, matching `/articles` and `/admin/partners` rather than an envelope — this list
 *  is offset-paginated, so a full page is already the caller's signal that more may exist. */
export declare const readerQueueResponseSchema: z.ZodArray<z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    email: z.ZodString;
    avatarUrl: z.ZodNullable<z.ZodString>;
    status: z.ZodEnum<["active", "banned"]>;
    mutedUntil: z.ZodNullable<z.ZodString>;
    commentCount: z.ZodNumber;
    createdAt: z.ZodString;
}, "strip", z.ZodTypeAny, {
    name: string;
    status: "active" | "banned";
    id: string;
    createdAt: string;
    email: string;
    avatarUrl: string | null;
    commentCount: number;
    mutedUntil: string | null;
}, {
    name: string;
    status: "active" | "banned";
    id: string;
    createdAt: string;
    email: string;
    avatarUrl: string | null;
    commentCount: number;
    mutedUntil: string | null;
}>, "many">;
export type ReaderQueueResponse = z.infer<typeof readerQueueResponseSchema>;
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
export declare const readerModerateRequestSchema: z.ZodEffects<z.ZodObject<{
    status: z.ZodOptional<z.ZodEnum<["active", "banned"]>>;
    mutedUntil: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    reason: z.ZodOptional<z.ZodString>;
}, "strict", z.ZodTypeAny, {
    status?: "active" | "banned" | undefined;
    reason?: string | undefined;
    mutedUntil?: string | null | undefined;
}, {
    status?: "active" | "banned" | undefined;
    reason?: string | undefined;
    mutedUntil?: string | null | undefined;
}>, {
    status?: "active" | "banned" | undefined;
    reason?: string | undefined;
    mutedUntil?: string | null | undefined;
}, {
    status?: "active" | "banned" | undefined;
    reason?: string | undefined;
    mutedUntil?: string | null | undefined;
}>;
export type ReaderModerateRequest = z.infer<typeof readerModerateRequestSchema>;
/** The per-target action history shape — one row per past action, oldest information never
 *  overwritten by a newer one (specs/community-moderation/spec.md - "A record persists after
 *  later actions on the same target"). `actorName` rather than a bare `actorId`, so a moderator
 *  reading history does not need a second lookup to know who acted. */
export declare const moderationActionResponseSchema: z.ZodObject<{
    id: z.ZodString;
    actorName: z.ZodString;
    targetType: z.ZodEnum<["comment", "reader"]>;
    targetId: z.ZodString;
    action: z.ZodEnum<["comment_removed", "comment_restored", "comment_reports_dismissed", "reader_muted", "reader_unmuted", "reader_banned", "reader_unbanned"]>;
    reason: z.ZodNullable<z.ZodString>;
    createdAt: z.ZodString;
}, "strip", z.ZodTypeAny, {
    id: string;
    createdAt: string;
    reason: string | null;
    actorName: string;
    targetType: "comment" | "reader";
    targetId: string;
    action: "comment_removed" | "comment_restored" | "comment_reports_dismissed" | "reader_muted" | "reader_unmuted" | "reader_banned" | "reader_unbanned";
}, {
    id: string;
    createdAt: string;
    reason: string | null;
    actorName: string;
    targetType: "comment" | "reader";
    targetId: string;
    action: "comment_removed" | "comment_restored" | "comment_reports_dismissed" | "reader_muted" | "reader_unmuted" | "reader_banned" | "reader_unbanned";
}>;
export type ModerationActionResponse = z.infer<typeof moderationActionResponseSchema>;
