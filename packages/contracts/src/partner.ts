import { z } from 'zod';

/**
 * A partner requires a logo at creation — mirrors `reelCreateRequestSchema.posterMediaId`
 * (specs/partner-management/spec.md - "A partner requires a logo"). `isActive` defaults to
 * active, matching the stored column default.
 */
export const partnerCreateRequestSchema = z
  .object({
    name: z.string().min(1).max(200),
    logoMediaId: z.string().uuid(),
    websiteUrl: z.string().url(),
    isActive: z.boolean().optional(),
  })
  .strict();
export type PartnerCreateRequest = z.infer<typeof partnerCreateRequestSchema>;

/**
 * All fields optional for a partial update. `sortOrder` is deliberately absent — order changes
 * only through the dedicated reorder endpoint, never through a per-partner update
 * (specs/partner-management/spec.md - "Partner order is replaced as a whole list").
 */
export const partnerUpdateRequestSchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    logoMediaId: z.string().uuid().optional(),
    websiteUrl: z.string().url().optional(),
    isActive: z.boolean().optional(),
  })
  .strict();
export type PartnerUpdateRequest = z.infer<typeof partnerUpdateRequestSchema>;

/**
 * Whole-list replacement, not a per-item operation
 * (specs/partner-management/spec.md - "Partner order is replaced as a whole list"). Unlike
 * `homeCurationReplaceRequestSchema`, this carries no maximum: every existing partner id must be
 * present, so the collection's size is bounded by however many partners exist, not by a curation
 * cap. Positions are derived server-side from array order.
 */
export const partnerReorderRequestSchema = z
  .object({
    partnerIds: z.array(z.string().uuid()).refine((ids) => new Set(ids).size === ids.length, {
      message: 'partnerIds must not contain duplicates',
    }),
  })
  .strict();
export type PartnerReorderRequest = z.infer<typeof partnerReorderRequestSchema>;

/**
 * The admin shape: includes `isActive` and `sortOrder` so the management screen can show and
 * debug both, neither of which a public consumer needs
 * (specs/partner-management/spec.md - "Admin list includes inactive partners").
 */
export const partnerResponseSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  logoUrl: z.string(),
  websiteUrl: z.string(),
  isActive: z.boolean(),
  sortOrder: z.number().int(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type PartnerResponse = z.infer<typeof partnerResponseSchema>;

/**
 * The public shape: only what the ticker renders
 * (specs/partner-management/spec.md - "Public partner listing serves only active partners in
 * order"). No `isActive` (every entry here is implicitly active) and no `sortOrder` (the array
 * position already carries the order).
 */
export const publicPartnerSchema = z.object({
  name: z.string(),
  logoUrl: z.string(),
  websiteUrl: z.string(),
});
export type PublicPartner = z.infer<typeof publicPartnerSchema>;
