import { z } from 'zod';
/**
 * Bounded so one submission cannot become an article. Enforced on the *trimmed* body, so padding
 * a body past the limit with whitespace is not a way through it.
 */
export const COMMENT_MAX_LENGTH = 2000;
/** Comments per page in the public listing. The listing returns a bare array, so a full page is
 *  also the client's signal that more may exist — mirroring `/articles` and `NewsExplorer`. */
export const COMMENT_PAGE_SIZE = 10;
/** Ceiling on a caller-supplied comment page size. */
export const MAX_COMMENT_LIST_LIMIT = 50;
/**
 * Clamped rather than rejected above the ceiling, matching `articlePublicListQuerySchema` — a
 * client asking for too many gets the cap, not a 400. `.min(1)` still rejects zero and negatives,
 * which are malformed rather than merely oversized.
 */
export const commentListQuerySchema = z.object({
    limit: z.coerce
        .number()
        .int()
        .min(1)
        .default(COMMENT_PAGE_SIZE)
        .transform((n) => Math.min(n, MAX_COMMENT_LIST_LIMIT)),
    offset: z.coerce.number().int().min(0).default(0),
});
/**
 * The one summary an article page needs, in one response. `likedByReader` is the only
 * caller-dependent field: it is `false` for anyone holding no reader session, never an error
 * (specs/article-engagement/spec.md - "The engagement summary reports counts and the caller's own
 * like state").
 */
export const articleEngagementSchema = z.object({
    viewCount: z.number().int().nonnegative(),
    likeCount: z.number().int().nonnegative(),
    commentCount: z.number().int().nonnegative(),
    likedByReader: z.boolean(),
});
/**
 * The toggle's outcome plus the resulting count, so the client can reconcile an optimistic update
 * against the server's number without a second request.
 */
export const likeToggleResponseSchema = z.object({
    liked: z.boolean(),
    likeCount: z.number().int().nonnegative(),
});
/**
 * Carries the author's display name and avatar and nothing else identifying — never the reader's
 * email or id. A comment is public, and the reader agreed to be named on it, not to be reachable
 * through it.
 */
export const commentResponseSchema = z.object({
    id: z.string().uuid(),
    body: z.string(),
    authorName: z.string(),
    authorAvatarUrl: z.string().nullable(),
    createdAt: z.string().datetime(),
});
/**
 * `.trim()` runs before `.min(1)`, so a body of only whitespace is rejected rather than stored as
 * an empty comment, and the trimmed text is what gets persisted.
 *
 * `.strict()` because the interesting rejections are the fields a caller might *invent*: an
 * `articleId` (the path already names it), a `readerId` (the session already names it), a
 * `status` (nothing in the product may set `removed`), or a `parentId` (comments are flat by
 * construction — specs/article-engagement/spec.md, "Comments are flat and stored as plain text").
 */
export const commentCreateRequestSchema = z
    .object({
    body: z.string().trim().min(1).max(COMMENT_MAX_LENGTH),
})
    .strict();
