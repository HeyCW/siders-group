import { z } from 'zod';
import { articleStatusSchema } from './article-status.js';
import { DEFAULT_PUBLIC_LIST_LIMIT, MAX_PUBLIC_LIST_LIMIT } from './article.js';

/**
 * The homepage curation list caps at 10 entries (specs/home-curation/spec.md - "Curated list
 * validation"). There
 * is deliberately no minimum: an empty list is valid and the homepage falls back to a purely
 * chronological feed.
 */
export const MAX_HOME_CURATION_ENTRIES = 10;

/**
 * Whole-list replacement, not a per-item operation (specs/home-curation/spec.md - "Curation is
 * replaced as a whole list"). The client submits an order; the server derives each entry's
 * position from its place in this array, so `position` is never accepted from the client.
 * Duplicate ids are rejected here, at the contract boundary, rather than left to a database
 * constraint further down.
 */
export const homeCurationReplaceRequestSchema = z
  .object({
    articleIds: z
      .array(z.string().uuid())
      .max(MAX_HOME_CURATION_ENTRIES)
      .refine((ids) => new Set(ids).size === ids.length, {
        message: 'articleIds must not contain duplicates',
      }),
  })
  .strict();
export type HomeCurationReplaceRequest = z.infer<typeof homeCurationReplaceRequestSchema>;

export const homeCurationArticleSummarySchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  slug: z.string(),
});
export type HomeCurationArticleSummary = z.infer<typeof homeCurationArticleSummarySchema>;

/**
 * The admin-only shape: every stored entry, including ones referencing a draft or
 * future-scheduled article, with enough information for the admin screen to badge a pick as
 * not-yet-live rather than leave the editor guessing
 * (specs/home-curation/spec.md - "Admin reads report each entry's visibility").
 */
export const homeCurationEntryResponseSchema = z.object({
  article: homeCurationArticleSummarySchema,
  status: articleStatusSchema,
  position: z.number().int(),
  isPubliclyVisible: z.boolean(),
});
export type HomeCurationEntryResponse = z.infer<typeof homeCurationEntryResponseSchema>;

/**
 * Consistent with the public article list endpoint's own default and cap
 * (specs/home-curation/spec.md - "Public homepage feed composes curated picks with chronological
 * backfill"; tasks.md - 2.5).
 */
export const homeFeedQuerySchema = z.object({
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .default(DEFAULT_PUBLIC_LIST_LIMIT)
    .transform((n) => Math.min(n, MAX_PUBLIC_LIST_LIMIT)),
});
export type HomeFeedQuery = z.infer<typeof homeFeedQuerySchema>;
