import { z } from 'zod';
/**
 * A partner's website URL is the one admin-supplied value in this system that reaches an `href`
 * on a public page (`apps/web/components/home/PartnerGrid.tsx`), so "absolute URL" is not a
 * sufficient rule: `z.string().url()` defers to `new URL()`, which happily accepts
 * `javascript:`, `data:` and `vbscript:`. React renders those into the SSR HTML with nothing but
 * a console warning, which would turn `settings.manage` into script execution on the public site.
 * The scheme allowlist is the guard (specs/partner-management/spec.md - "A partner website URL
 * must be http or https"), and it is exported so the admin form validates identically rather than
 * re-deriving the rule (`apps/admin/src/pages/PartnersPage.tsx`).
 */
export declare function isHttpUrl(value: string): boolean;
/**
 * A partner requires a logo at creation — mirrors `guidePickCreateRequestSchema.photoMediaId`
 * (specs/partner-management/spec.md - "A partner requires a logo"). `isActive` defaults to
 * active, matching the stored column default.
 */
export declare const partnerCreateRequestSchema: z.ZodObject<{
    name: z.ZodString;
    logoMediaId: z.ZodString;
    websiteUrl: z.ZodOptional<z.ZodNullable<z.ZodEffects<z.ZodString, string, string>>>;
    isActive: z.ZodOptional<z.ZodBoolean>;
}, "strict", z.ZodTypeAny, {
    name: string;
    logoMediaId: string;
    websiteUrl?: string | null | undefined;
    isActive?: boolean | undefined;
}, {
    name: string;
    logoMediaId: string;
    websiteUrl?: string | null | undefined;
    isActive?: boolean | undefined;
}>;
export type PartnerCreateRequest = z.infer<typeof partnerCreateRequestSchema>;
/**
 * All fields optional for a partial update. `sortOrder` is deliberately absent — order changes
 * only through the dedicated reorder endpoint, never through a per-partner update
 * (specs/partner-management/spec.md - "Partner order is replaced as a whole list"). `websiteUrl`
 * is `.nullable()` on top of `.optional()`, the same shape as `articleWriteFieldsSchema`'s
 * `featuredMediaId`: absent means "leave it as it is", `null` means "clear it".
 */
export declare const partnerUpdateRequestSchema: z.ZodObject<{
    name: z.ZodOptional<z.ZodString>;
    logoMediaId: z.ZodOptional<z.ZodString>;
    websiteUrl: z.ZodOptional<z.ZodNullable<z.ZodEffects<z.ZodString, string, string>>>;
    isActive: z.ZodOptional<z.ZodBoolean>;
}, "strict", z.ZodTypeAny, {
    name?: string | undefined;
    logoMediaId?: string | undefined;
    websiteUrl?: string | null | undefined;
    isActive?: boolean | undefined;
}, {
    name?: string | undefined;
    logoMediaId?: string | undefined;
    websiteUrl?: string | null | undefined;
    isActive?: boolean | undefined;
}>;
export type PartnerUpdateRequest = z.infer<typeof partnerUpdateRequestSchema>;
/**
 * Whole-list replacement, not a per-item operation
 * (specs/partner-management/spec.md - "Partner order is replaced as a whole list"). Unlike
 * `homeCurationReplaceRequestSchema`, this carries no maximum: every existing partner id must be
 * present, so the collection's size is bounded by however many partners exist, not by a curation
 * cap. Positions are derived server-side from array order.
 */
export declare const partnerReorderRequestSchema: z.ZodObject<{
    partnerIds: z.ZodEffects<z.ZodArray<z.ZodString, "many">, string[], string[]>;
}, "strict", z.ZodTypeAny, {
    partnerIds: string[];
}, {
    partnerIds: string[];
}>;
export type PartnerReorderRequest = z.infer<typeof partnerReorderRequestSchema>;
/**
 * The admin shape: includes `isActive` and `sortOrder` so the management screen can show and
 * debug both, neither of which a public consumer needs
 * (specs/partner-management/spec.md - "Admin list includes inactive partners").
 */
export declare const partnerResponseSchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    logoUrl: z.ZodString;
    websiteUrl: z.ZodNullable<z.ZodString>;
    isActive: z.ZodBoolean;
    sortOrder: z.ZodNumber;
    createdAt: z.ZodString;
    updatedAt: z.ZodString;
}, "strip", z.ZodTypeAny, {
    name: string;
    websiteUrl: string | null;
    isActive: boolean;
    id: string;
    logoUrl: string;
    sortOrder: number;
    createdAt: string;
    updatedAt: string;
}, {
    name: string;
    websiteUrl: string | null;
    isActive: boolean;
    id: string;
    logoUrl: string;
    sortOrder: number;
    createdAt: string;
    updatedAt: string;
}>;
export type PartnerResponse = z.infer<typeof partnerResponseSchema>;
/**
 * The public shape: only what the ticker renders
 * (specs/partner-management/spec.md - "Public partner listing serves only active partners in
 * order"). No `isActive` (every entry here is implicitly active) and no `sortOrder` (the array
 * position already carries the order).
 */
export declare const publicPartnerSchema: z.ZodObject<{
    name: z.ZodString;
    logoUrl: z.ZodString;
    websiteUrl: z.ZodNullable<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    name: string;
    websiteUrl: string | null;
    logoUrl: string;
}, {
    name: string;
    websiteUrl: string | null;
    logoUrl: string;
}>;
export type PublicPartner = z.infer<typeof publicPartnerSchema>;
