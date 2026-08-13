import { z } from 'zod';
import { reelProviderSchema } from './reelProvider.js';

/**
 * `unavailable` denotes a reel whose source video can no longer be played — set manually when a
 * provider post is deleted or made private, without touching the reels ordering
 * (specs/reels-curation/spec.md - "Reel status governs public visibility").
 */
export const REEL_STATUSES = ['draft', 'published', 'unavailable'] as const;
export const reelStatusSchema = z.enum(REEL_STATUSES);
export type ReelStatus = z.infer<typeof reelStatusSchema>;

/**
 * The client submits a URL; the server parses it and persists only the extracted
 * `(provider, externalId)` — the submitted URL itself is never stored
 * (specs/reels-curation/spec.md - "Only a provider identity is persisted"). `posterMediaId` is
 * required: a reel cannot be created without a locally stored poster
 * (specs/reels-curation/spec.md - "Every reel has a locally stored poster image").
 */
export const reelCreateRequestSchema = z
  .object({
    url: z.string().url(),
    posterMediaId: z.string().uuid(),
    caption: z.string().max(1000).optional(),
  })
  .strict();
export type ReelCreateRequest = z.infer<typeof reelCreateRequestSchema>;

/**
 * The provider and identifier are immutable after creation — editing a reel never re-parses a
 * URL. Only presentation fields and status can change.
 */
export const reelUpdateRequestSchema = z
  .object({
    posterMediaId: z.string().uuid().optional(),
    caption: z.string().max(1000).nullable().optional(),
    status: reelStatusSchema.optional(),
  })
  .strict();
export type ReelUpdateRequest = z.infer<typeof reelUpdateRequestSchema>;

/**
 * The admin shape. Deliberately carries no `url` field — there is no stored URL to return
 * (specs/reels-curation/spec.md - "Only a provider identity is persisted" - "Submitted URL is
 * discarded").
 */
export const reelResponseSchema = z.object({
  id: z.string().uuid(),
  provider: reelProviderSchema,
  externalId: z.string(),
  posterUrl: z.string(),
  caption: z.string().nullable(),
  status: reelStatusSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type ReelResponse = z.infer<typeof reelResponseSchema>;

/**
 * The public shape: structured fields only, never HTML, an iframe, or an embed URL
 * (specs/reels-curation/spec.md - "Public reels endpoint serves structured data"). Consumers
 * compose the embed reference themselves via `buildReelEmbedUrl(provider, externalId)` at
 * render time, on user activation — this response carries no markup for it to leak through.
 */
export const publicReelItemSchema = z.object({
  provider: reelProviderSchema,
  externalId: z.string(),
  posterUrl: z.string(),
  caption: z.string().nullable(),
});
export type PublicReelItem = z.infer<typeof publicReelItemSchema>;
