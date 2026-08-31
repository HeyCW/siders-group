import { z } from 'zod';
/**
 * A guide pick requires a video at creation; its photo is optional
 * (specs/guide-of-the-week-management/spec.md - "A guide pick's photo is optional", "A guide pick
 * requires a self-hosted video"). `isActive` defaults to active, matching the stored column
 * default.
 */
export const guidePickCreateRequestSchema = z
    .object({
    city: z.string().min(1).max(200),
    place: z.string().min(1).max(200),
    description: z.string().min(1).max(1000),
    photoMediaId: z.string().uuid().optional(),
    videoMediaId: z.string().uuid(),
    isActive: z.boolean().optional(),
})
    .strict();
/**
 * All fields optional for a partial update. `sortOrder` is deliberately absent — order changes
 * only through the dedicated reorder endpoint, never through a per-pick update
 * (specs/guide-of-the-week-management/spec.md - "Guide-pick order is replaced as a whole list").
 * `videoMediaId` may be updated to a new video but, like `photoMediaId`, has no way to be cleared
 * to empty — there is no nullable variant of either field
 * (specs/guide-of-the-week-management/spec.md - "A guide pick cannot be left without its video").
 */
export const guidePickUpdateRequestSchema = z
    .object({
    city: z.string().min(1).max(200).optional(),
    place: z.string().min(1).max(200).optional(),
    description: z.string().min(1).max(1000).optional(),
    photoMediaId: z.string().uuid().optional(),
    videoMediaId: z.string().uuid().optional(),
    isActive: z.boolean().optional(),
})
    .strict();
/**
 * Whole-list replacement, not a per-item operation
 * (specs/guide-of-the-week-management/spec.md - "Guide-pick order is replaced as a whole list").
 * No maximum-length constraint — every existing guide-pick id must be present, so the
 * collection's size is bounded by however many guide picks exist, not by a fixed cap
 * (design.md - "No maximum pick count"). Positions are derived server-side from array order.
 */
export const guidePickReorderRequestSchema = z
    .object({
    guidePickIds: z.array(z.string().uuid()).refine((ids) => new Set(ids).size === ids.length, {
        message: 'guidePickIds must not contain duplicates',
    }),
})
    .strict();
/**
 * The admin shape: includes `isActive` and `sortOrder` so the management screen can show and
 * debug both, neither of which a public consumer needs
 * (specs/guide-of-the-week-management/spec.md - "Admin list includes inactive guide picks").
 */
export const guidePickResponseSchema = z.object({
    id: z.string().uuid(),
    city: z.string(),
    place: z.string(),
    description: z.string(),
    photoUrl: z.string().nullable(),
    videoUrl: z.string(),
    isActive: z.boolean(),
    sortOrder: z.number().int(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
});
/**
 * The public shape: only what the home page section renders
 * (specs/guide-of-the-week-management/spec.md - "Public read serves only active guide picks in
 * order"). No `isActive` (every entry here is implicitly active) and no `sortOrder` or `id` (array
 * position already carries the order). `city` travels with each entry rather than the response
 * being grouped by city — grouping is a rendering concern of the consuming page, not this
 * endpoint's shape (specs/web-public-site/spec.md - "The guideline section groups its videos by
 * city").
 */
export const publicGuidePickSchema = z.object({
    city: z.string(),
    place: z.string(),
    description: z.string(),
    photoUrl: z.string().nullable(),
    videoUrl: z.string(),
});
