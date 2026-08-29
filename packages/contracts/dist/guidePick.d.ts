import { z } from 'zod';
/**
 * A guide pick requires a photo and a video at creation — mirrors
 * `partnerCreateRequestSchema.logoMediaId` (specs/guide-of-the-week-management/spec.md - "A guide
 * pick requires a photo", "A guide pick requires a self-hosted video"). The photo now serves as
 * the video's poster. `isActive` defaults to active, matching the stored column default.
 */
export declare const guidePickCreateRequestSchema: z.ZodObject<{
    city: z.ZodString;
    place: z.ZodString;
    description: z.ZodString;
    photoMediaId: z.ZodString;
    videoMediaId: z.ZodString;
    isActive: z.ZodOptional<z.ZodBoolean>;
}, "strict", z.ZodTypeAny, {
    description: string;
    city: string;
    place: string;
    photoMediaId: string;
    videoMediaId: string;
    isActive?: boolean | undefined;
}, {
    description: string;
    city: string;
    place: string;
    photoMediaId: string;
    videoMediaId: string;
    isActive?: boolean | undefined;
}>;
export type GuidePickCreateRequest = z.infer<typeof guidePickCreateRequestSchema>;
/**
 * All fields optional for a partial update. `sortOrder` is deliberately absent — order changes
 * only through the dedicated reorder endpoint, never through a per-pick update
 * (specs/guide-of-the-week-management/spec.md - "Guide-pick order is replaced as a whole list").
 * `videoMediaId` may be updated to a new video but, like `photoMediaId`, has no way to be cleared
 * to empty — there is no nullable variant of either field
 * (specs/guide-of-the-week-management/spec.md - "A guide pick cannot be left without its video").
 */
export declare const guidePickUpdateRequestSchema: z.ZodObject<{
    city: z.ZodOptional<z.ZodString>;
    place: z.ZodOptional<z.ZodString>;
    description: z.ZodOptional<z.ZodString>;
    photoMediaId: z.ZodOptional<z.ZodString>;
    videoMediaId: z.ZodOptional<z.ZodString>;
    isActive: z.ZodOptional<z.ZodBoolean>;
}, "strict", z.ZodTypeAny, {
    isActive?: boolean | undefined;
    description?: string | undefined;
    city?: string | undefined;
    place?: string | undefined;
    photoMediaId?: string | undefined;
    videoMediaId?: string | undefined;
}, {
    isActive?: boolean | undefined;
    description?: string | undefined;
    city?: string | undefined;
    place?: string | undefined;
    photoMediaId?: string | undefined;
    videoMediaId?: string | undefined;
}>;
export type GuidePickUpdateRequest = z.infer<typeof guidePickUpdateRequestSchema>;
/**
 * Whole-list replacement, not a per-item operation
 * (specs/guide-of-the-week-management/spec.md - "Guide-pick order is replaced as a whole list").
 * No maximum-length constraint — every existing guide-pick id must be present, so the
 * collection's size is bounded by however many guide picks exist, not by a fixed cap
 * (design.md - "No maximum pick count"). Positions are derived server-side from array order.
 */
export declare const guidePickReorderRequestSchema: z.ZodObject<{
    guidePickIds: z.ZodEffects<z.ZodArray<z.ZodString, "many">, string[], string[]>;
}, "strict", z.ZodTypeAny, {
    guidePickIds: string[];
}, {
    guidePickIds: string[];
}>;
export type GuidePickReorderRequest = z.infer<typeof guidePickReorderRequestSchema>;
/**
 * The admin shape: includes `isActive` and `sortOrder` so the management screen can show and
 * debug both, neither of which a public consumer needs
 * (specs/guide-of-the-week-management/spec.md - "Admin list includes inactive guide picks").
 */
export declare const guidePickResponseSchema: z.ZodObject<{
    id: z.ZodString;
    city: z.ZodString;
    place: z.ZodString;
    description: z.ZodString;
    photoUrl: z.ZodString;
    videoUrl: z.ZodString;
    isActive: z.ZodBoolean;
    sortOrder: z.ZodNumber;
    createdAt: z.ZodString;
    updatedAt: z.ZodString;
}, "strip", z.ZodTypeAny, {
    isActive: boolean;
    id: string;
    sortOrder: number;
    createdAt: string;
    updatedAt: string;
    description: string;
    city: string;
    place: string;
    photoUrl: string;
    videoUrl: string;
}, {
    isActive: boolean;
    id: string;
    sortOrder: number;
    createdAt: string;
    updatedAt: string;
    description: string;
    city: string;
    place: string;
    photoUrl: string;
    videoUrl: string;
}>;
export type GuidePickResponse = z.infer<typeof guidePickResponseSchema>;
/**
 * The public shape: only what the home page section renders
 * (specs/guide-of-the-week-management/spec.md - "Public read serves only active guide picks in
 * order"). No `isActive` (every entry here is implicitly active) and no `sortOrder` or `id` (array
 * position already carries the order). `city` travels with each entry rather than the response
 * being grouped by city — grouping is a rendering concern of the consuming page, not this
 * endpoint's shape (specs/web-public-site/spec.md - "The guideline section groups its videos by
 * city").
 */
export declare const publicGuidePickSchema: z.ZodObject<{
    city: z.ZodString;
    place: z.ZodString;
    description: z.ZodString;
    photoUrl: z.ZodString;
    videoUrl: z.ZodString;
}, "strip", z.ZodTypeAny, {
    description: string;
    city: string;
    place: string;
    photoUrl: string;
    videoUrl: string;
}, {
    description: string;
    city: string;
    place: string;
    photoUrl: string;
    videoUrl: string;
}>;
export type PublicGuidePick = z.infer<typeof publicGuidePickSchema>;
