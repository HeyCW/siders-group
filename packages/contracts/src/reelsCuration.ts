import { z } from 'zod';
import { reelStatusSchema } from './reel.js';
import { reelProviderSchema } from './reelProvider.js';

/**
 * Mirrors `MAX_HOME_CURATION_ENTRIES` (specs/reels-curation/spec.md - "Ordering validation").
 * No minimum: an empty ordering is valid, and the public rail simply shows nothing rather than
 * being backfilled (specs/reels-curation/spec.md - "The rail is not backfilled").
 */
export const MAX_REELS_CURATION_ENTRIES = 10;

/**
 * Whole-list replacement, not a per-item operation
 * (specs/reels-curation/spec.md - "The ordering is replaced as a whole list"). Positions are
 * derived server-side from array order, so this schema declares no `position` field and is
 * `.strict()` so one supplied by a caller is a validation error rather than silently ignored.
 */
export const reelsCurationReplaceRequestSchema = z
  .object({
    reelIds: z
      .array(z.string().uuid())
      .max(MAX_REELS_CURATION_ENTRIES)
      .refine((ids) => new Set(ids).size === ids.length, {
        message: 'reelIds must not contain duplicates',
      }),
  })
  .strict();
export type ReelsCurationReplaceRequest = z.infer<typeof reelsCurationReplaceRequestSchema>;

export const reelsCurationReelSummarySchema = z.object({
  id: z.string().uuid(),
  provider: reelProviderSchema,
  externalId: z.string(),
  posterUrl: z.string(),
  caption: z.string().nullable(),
});
export type ReelsCurationReelSummary = z.infer<typeof reelsCurationReelSummarySchema>;

/**
 * The admin-only shape: every stored entry, including ones referencing a draft or unavailable
 * reel, with enough information for the admin screen to badge an entry as not-live rather than
 * leave the editor guessing (specs/reels-curation/spec.md - "Admin reads report each entry's
 * visibility").
 */
export const reelsCurationEntryResponseSchema = z.object({
  reel: reelsCurationReelSummarySchema,
  status: reelStatusSchema,
  position: z.number().int(),
  isPubliclyVisible: z.boolean(),
});
export type ReelsCurationEntryResponse = z.infer<typeof reelsCurationEntryResponseSchema>;
