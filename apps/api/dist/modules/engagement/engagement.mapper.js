/** The reader's display name and avatar and nothing else — never their id or email, both of which
 *  the row carries and the public shape deliberately drops (`packages/contracts/src/engagement.ts`). */
export function toCommentResponse(row) {
    return {
        id: row.id,
        body: row.body,
        authorName: row.authorName,
        authorAvatarUrl: row.authorAvatarUrl,
        createdAt: row.createdAt.toISOString(),
    };
}
/** `likedByReader` is supplied by the service rather than read off the counts, since it is the one
 *  caller-dependent field in an otherwise article-wide summary. */
export function toArticleEngagement(counts, likedByReader) {
    return {
        viewCount: counts.viewCount,
        likeCount: counts.likeCount,
        commentCount: counts.commentCount,
        likedByReader,
    };
}
