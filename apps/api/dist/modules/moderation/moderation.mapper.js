/** No reader id or email — `CommentQueueRow`'s author fields are exactly `authorName`, mirroring
 *  `engagement.mapper.ts`'s existing public `CommentResponse` convention. This one carries an
 *  extra `status`, since a moderator (unlike a public reader) needs to see removed comments too.
 *
 * `openReportCount`/`reportReasons` are omitted entirely — not sent as `0`/`[]` — when the
 * comment carries no unresolved report (specs/community-moderation/spec.md - "A comment's open
 * report count and reasons are never themselves an action": the absence of a report is not
 * itself information a moderator reads).
 */
export function toCommentQueueRow(row) {
    return {
        id: row.id,
        body: row.body,
        status: row.status,
        articleId: row.articleId,
        articleTitle: row.articleTitle,
        articleSlug: row.articleSlug,
        authorName: row.authorName,
        createdAt: row.createdAt.toISOString(),
        ...(row.openReportCount && row.openReportCount > 0 ? { openReportCount: row.openReportCount } : {}),
        ...(row.reportReasons && row.reportReasons.length > 0 ? { reportReasons: row.reportReasons } : {}),
    };
}
export function toReaderQueueRow(row) {
    return {
        id: row.id,
        name: row.name,
        email: row.email,
        avatarUrl: row.avatarUrl,
        status: row.status,
        mutedUntil: row.mutedUntil ? row.mutedUntil.toISOString() : null,
        commentCount: row.commentCount,
        createdAt: row.createdAt.toISOString(),
    };
}
export function toModerationActionResponse(row) {
    return {
        id: row.id,
        actorName: row.actorName,
        targetType: row.targetType,
        targetId: row.targetId,
        action: row.action,
        reason: row.reason,
        createdAt: row.createdAt.toISOString(),
    };
}
/** No `reporterId` — a report is confirmation to the reporting reader of their own submission,
 *  never surfaced to anyone else (`packages/contracts/src/moderation.ts`). */
export function toCommentReportResponse(row) {
    return {
        id: row.id,
        commentId: row.commentId,
        reason: row.reason,
        note: row.note,
        createdAt: row.createdAt.toISOString(),
    };
}
