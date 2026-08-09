import { z } from 'zod';
import { articleStatusSchema } from './article-status.js';
import { categoryResponseSchema } from './category.js';
import { tagResponseSchema } from './tag.js';

/** Manual slug overrides go through the same shape the auto-generator produces. */
export const articleSlugSchema = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'must be a lowercase, kebab-case, URL-safe slug');

/**
 * The editor's Tiptap/ProseMirror document. Deliberately unconstrained in shape — `sanitizeHtml`
 * is the layer that enforces meaning, and treats anything it doesn't recognize as absent
 * (design.md - Risks: "ProseMirror JSON schema evolution" is out of scope for this change).
 */
export const articleBodyJsonSchema = z.unknown();

/**
 * Full article edit. No `author_id` field exists here or anywhere below — the author is always
 * the authenticated session (specs/article-management/spec.md - "Author derived from session").
 * `slug` is accepted for a manual override; auto-generation from the title happens server-side
 * only when the article has no slug yet (design.md - "Slug generation").
 */
export const articleWriteFieldsSchema = z.object({
  title: z.string().min(1).max(500),
  slug: articleSlugSchema.optional(),
  bodyJson: articleBodyJsonSchema.optional(),
  excerpt: z.string().max(1000).optional(),
  categoryIds: z.array(z.string().uuid()).optional(),
  tagIds: z.array(z.string().uuid()).optional(),
  featuredMediaId: z.string().uuid().nullable().optional(),
  seoTitle: z.string().max(200).optional(),
  seoDescription: z.string().max(500).optional(),
});

export const articleCreateRequestSchema = articleWriteFieldsSchema.strict();
export type ArticleCreateRequest = z.infer<typeof articleCreateRequestSchema>;

export const articleUpdateRequestSchema = articleWriteFieldsSchema.partial().strict();
export type ArticleUpdateRequest = z.infer<typeof articleUpdateRequestSchema>;

/**
 * Autosave is deliberately a narrower schema than the general update — it has no `slug` field
 * and no status-changing field at all, so an autosave request structurally cannot move the
 * slug or the status even if a client tried (design.md - "Autosave never changes the slug",
 * specs/article-management/spec.md - "Autosave never alters the slug").
 */
export const articleAutosaveRequestSchema = z
  .object({
    title: z.string().min(1).max(500).optional(),
    bodyJson: articleBodyJsonSchema.optional(),
    excerpt: z.string().max(1000).optional(),
    categoryIds: z.array(z.string().uuid()).optional(),
    tagIds: z.array(z.string().uuid()).optional(),
    featuredMediaId: z.string().uuid().nullable().optional(),
    seoTitle: z.string().max(200).optional(),
    seoDescription: z.string().max(500).optional(),
  })
  .strict();
export type ArticleAutosaveRequest = z.infer<typeof articleAutosaveRequestSchema>;

/** Publish and unpublish take no body — the transition itself is the entire request. */
export const articleScheduleRequestSchema = z
  .object({
    publishedAt: z.string().datetime(),
  })
  .strict();
export type ArticleScheduleRequest = z.infer<typeof articleScheduleRequestSchema>;

export const DEFAULT_PUBLIC_LIST_LIMIT = 20;
export const MAX_PUBLIC_LIST_LIMIT = 100;

/**
 * `excludeIds` arrives as a comma-separated query string and is split before validation, since
 * a repeated-key array isn't guaranteed across every HTTP client
 * (specs/public-news-api/spec.md - "Excluding specific articles from the list").
 */
export const articlePublicListQuerySchema = z.object({
  // Clamped, not rejected: a client asking for more than the cap gets the cap, not a 400
  // (specs/public-news-api/spec.md - "Scenario: Limit is capped"). `.min(1)` still rejects zero
  // and negatives — those are malformed, not merely oversized, and no scenario asks for them to
  // be clamped.
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .default(DEFAULT_PUBLIC_LIST_LIMIT)
    .transform((n) => Math.min(n, MAX_PUBLIC_LIST_LIMIT)),
  offset: z.coerce.number().int().min(0).default(0),
  categorySlug: z.string().optional(),
  tagSlug: z.string().optional(),
  excludeIds: z
    .preprocess(
      (value) => (typeof value === 'string' && value.length > 0 ? value.split(',') : undefined),
      z.array(z.string().uuid()).optional(),
    ),
});
export type ArticlePublicListQuery = z.infer<typeof articlePublicListQuerySchema>;

/** The card shape used by both the public list and by any consumer composing a listing page. */
export const articlePublicCardSchema = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  title: z.string(),
  excerpt: z.string().nullable(),
  featuredImageUrl: z.string().nullable(),
  categories: z.array(categoryResponseSchema),
  tags: z.array(tagResponseSchema),
  authorName: z.string(),
  publishedAt: z.string().datetime(),
});
export type ArticlePublicCard = z.infer<typeof articlePublicCardSchema>;

/**
 * The by-slug detail response. Carries `bodyHtml` and never `bodyJson`
 * (specs/article-management/spec.md - "Only sanitized HTML is served publicly").
 */
export const articlePublicDetailSchema = articlePublicCardSchema.extend({
  bodyHtml: z.string(),
  seoTitle: z.string().nullable(),
  seoDescription: z.string().nullable(),
});
export type ArticlePublicDetail = z.infer<typeof articlePublicDetailSchema>;

/** The admin-facing shape: everything the public gets, plus authoring state and `bodyJson`. */
export const articleAdminResponseSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  slug: z.string(),
  bodyJson: z.unknown(),
  bodyHtml: z.string(),
  excerpt: z.string().nullable(),
  status: articleStatusSchema,
  authorId: z.string().uuid(),
  authorName: z.string(),
  featuredMediaId: z.string().uuid().nullable(),
  featuredImageUrl: z.string().nullable(),
  categories: z.array(categoryResponseSchema),
  tags: z.array(tagResponseSchema),
  seoTitle: z.string().nullable(),
  seoDescription: z.string().nullable(),
  publishedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type ArticleAdminResponse = z.infer<typeof articleAdminResponseSchema>;
