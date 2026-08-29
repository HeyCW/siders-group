import { z } from 'zod';
/**
 * Bounded so one submission cannot become an article. Enforced on the *trimmed* body, so padding
 * a body past the limit with whitespace is not a way through it.
 */
export declare const COMMENT_MAX_LENGTH = 2000;
/** Comments per page in the public listing. The listing returns a bare array, so a full page is
 *  also the client's signal that more may exist — mirroring `/articles` and `NewsExplorer`. */
export declare const COMMENT_PAGE_SIZE = 10;
/** Ceiling on a caller-supplied comment page size. */
export declare const MAX_COMMENT_LIST_LIMIT = 50;
/**
 * Clamped rather than rejected above the ceiling, matching `articlePublicListQuerySchema` — a
 * client asking for too many gets the cap, not a 400. `.min(1)` still rejects zero and negatives,
 * which are malformed rather than merely oversized.
 */
export declare const commentListQuerySchema: z.ZodObject<{
    limit: z.ZodEffects<z.ZodDefault<z.ZodNumber>, number, number | undefined>;
    offset: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    limit: number;
    offset: number;
}, {
    limit?: number | undefined;
    offset?: number | undefined;
}>;
export type CommentListQuery = z.infer<typeof commentListQuerySchema>;
/**
 * The one summary an article page needs, in one response. `likedByReader` is the only
 * caller-dependent field: it is `false` for anyone holding no reader session, never an error
 * (specs/article-engagement/spec.md - "The engagement summary reports counts and the caller's own
 * like state").
 */
export declare const articleEngagementSchema: z.ZodObject<{
    viewCount: z.ZodNumber;
    likeCount: z.ZodNumber;
    commentCount: z.ZodNumber;
    likedByReader: z.ZodBoolean;
}, "strip", z.ZodTypeAny, {
    viewCount: number;
    likeCount: number;
    commentCount: number;
    likedByReader: boolean;
}, {
    viewCount: number;
    likeCount: number;
    commentCount: number;
    likedByReader: boolean;
}>;
export type ArticleEngagement = z.infer<typeof articleEngagementSchema>;
/**
 * The toggle's outcome plus the resulting count, so the client can reconcile an optimistic update
 * against the server's number without a second request.
 */
export declare const likeToggleResponseSchema: z.ZodObject<{
    liked: z.ZodBoolean;
    likeCount: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    likeCount: number;
    liked: boolean;
}, {
    likeCount: number;
    liked: boolean;
}>;
export type LikeToggleResponse = z.infer<typeof likeToggleResponseSchema>;
/**
 * Carries the author's display name and avatar and nothing else identifying — never the reader's
 * email or id. A comment is public, and the reader agreed to be named on it, not to be reachable
 * through it.
 */
export declare const commentResponseSchema: z.ZodObject<{
    id: z.ZodString;
    body: z.ZodString;
    authorName: z.ZodString;
    authorAvatarUrl: z.ZodNullable<z.ZodString>;
    createdAt: z.ZodString;
}, "strip", z.ZodTypeAny, {
    id: string;
    createdAt: string;
    authorName: string;
    body: string;
    authorAvatarUrl: string | null;
}, {
    id: string;
    createdAt: string;
    authorName: string;
    body: string;
    authorAvatarUrl: string | null;
}>;
export type CommentResponse = z.infer<typeof commentResponseSchema>;
/**
 * `.trim()` runs before `.min(1)`, so a body of only whitespace is rejected rather than stored as
 * an empty comment, and the trimmed text is what gets persisted.
 *
 * `.strict()` because the interesting rejections are the fields a caller might *invent*: an
 * `articleId` (the path already names it), a `readerId` (the session already names it), a
 * `status` (nothing in the product may set `removed`), or a `parentId` (comments are flat by
 * construction — specs/article-engagement/spec.md, "Comments are flat and stored as plain text").
 */
export declare const commentCreateRequestSchema: z.ZodObject<{
    body: z.ZodString;
}, "strict", z.ZodTypeAny, {
    body: string;
}, {
    body: string;
}>;
export type CommentCreateRequest = z.infer<typeof commentCreateRequestSchema>;
