import { z } from 'zod';
import { isHttpUrl } from './partner.js';
export const anakUsahaCreateRequestSchema = z
    .object({
    name: z.string().min(1).max(200),
})
    .strict();
export const anakUsahaUpdateRequestSchema = z
    .object({
    name: z.string().min(1).max(200),
})
    .strict();
export const anakUsahaResponseSchema = z.object({
    id: z.string().uuid(),
    name: z.string(),
    slug: z.string(),
});
/**
 * The fixed set of groupings the public site's masthead logo row (`ConnectedPlatforms.tsx`)
 * filters by. Kept as a Zod enum rather than a Postgres enum (design.md - "kind as a text column
 * with contract-level validation") so a typo can never silently drop a brand from that grouping
 * the way a free-text column would.
 */
export const anakUsahaKindSchema = z.enum(['Media Platform', 'News & Community']);
/**
 * A profile link's URL reuses `partner.ts`'s `isHttpUrl` guard rather than re-deriving it — same
 * hazard as a partner website URL: this value reaches a public `href`
 * (specs/anak-usaha-presentation/spec.md - "A profile link must be http or https").
 */
/**
 * The tile background color an admin picks for the entry's logo box (`AnakUsahaTiles.tsx`).
 * `#rrggbb` only — no shorthand, no alpha, no named colors — so the web app never has to guess a
 * format when it hands the value straight to an inline `style.backgroundColor`.
 */
export const hexColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Must be a hex color like #RRGGBB');
export const anakUsahaLinkSchema = z
    .object({
    label: z.string().min(1).max(100),
    href: z.string().url().refine(isHttpUrl, { message: 'Link URL must use http or https' }),
})
    .strict();
/**
 * Which taxonomy entry the profile presents is the `:id` in the route
 * (`POST /anak-usaha/:id/profile`), not a body field — carrying it in both places would only
 * invite a mismatch between the two. The entry must already exist
 * (specs/anak-usaha-presentation/spec.md - "A profile presents exactly one anak usaha entry"),
 * enforced by the service layer against `anak_usaha`. `logoMediaId` is nullable, unlike
 * `partnerCreateRequestSchema.logoMediaId` (design.md - "Logo FK is nullable").
 */
export const anakUsahaProfileCreateRequestSchema = z
    .object({
    logoMediaId: z.string().uuid().nullable().optional(),
    backgroundColor: hexColorSchema.nullable().optional(),
    description: z.string().max(2000).nullable().optional(),
    kind: anakUsahaKindSchema,
    links: z.array(anakUsahaLinkSchema).max(10).optional(),
})
    .strict();
/**
 * All fields optional for a partial update. `sortOrder` is deliberately absent, same as
 * `partnerUpdateRequestSchema` — order changes only through the dedicated reorder endpoint
 * (specs/anak-usaha-presentation/spec.md - "Profile order is replaced as a whole list").
 */
export const anakUsahaProfileUpdateRequestSchema = z
    .object({
    logoMediaId: z.string().uuid().nullable().optional(),
    backgroundColor: hexColorSchema.nullable().optional(),
    description: z.string().max(2000).nullable().optional(),
    kind: anakUsahaKindSchema.optional(),
    links: z.array(anakUsahaLinkSchema).max(10).optional(),
    isActive: z.boolean().optional(),
})
    .strict();
/**
 * Whole-list replacement, identical shape to `partnerReorderRequestSchema`
 * (specs/anak-usaha-presentation/spec.md - "Profile order is replaced as a whole list"). Each id
 * is the `anakUsahaId` a profile belongs to, since the profile has no separate id of its own.
 */
export const anakUsahaProfileReorderRequestSchema = z
    .object({
    anakUsahaIds: z.array(z.string().uuid()).refine((ids) => new Set(ids).size === ids.length, {
        message: 'anakUsahaIds must not contain duplicates',
    }),
})
    .strict();
/**
 * The profile fields as returned to callers, nested rather than flattened onto the taxonomy shape
 * so "this entry has no profile yet" is exactly `profile: null`, not a set of blank fields.
 */
export const anakUsahaProfileFieldsSchema = z.object({
    logoUrl: z.string().nullable(),
    backgroundColor: z.string().nullable(),
    description: z.string().nullable(),
    kind: anakUsahaKindSchema,
    links: z.array(anakUsahaLinkSchema),
    sortOrder: z.number().int(),
    isActive: z.boolean(),
});
/**
 * The admin shape: every taxonomy entry plus its profile, or `null` when it has none — lets the
 * new admin screen show every anak usaha entry and offer to create a profile for the ones
 * without (specs/anak-usaha-presentation/spec.md).
 */
export const anakUsahaAdminResponseSchema = anakUsahaResponseSchema.extend({
    profile: anakUsahaProfileFieldsSchema.nullable(),
});
/**
 * The public shape stays the existing `{id, name, slug}` response for every entry — this is the
 * same listing article tagging and the `/news` filter already read, and both need every entry
 * regardless of whether it has a profile. Presentation fields are added only for an entry with an
 * active profile (design.md - "Public data folded into the existing GET /anak-usaha endpoint");
 * an entry with none, or an inactive one, keeps the plain shape with no presentation fields at
 * all, and it is the web app's rendering — not this endpoint — that decides which entries make up
 * the visible Anak Usaha section (specs/anak-usaha-presentation/spec.md - "The public site
 * renders only entries with an active profile").
 */
export const publicAnakUsahaSchema = anakUsahaResponseSchema.extend({
    logoUrl: z.string().nullable().optional(),
    backgroundColor: z.string().nullable().optional(),
    description: z.string().nullable().optional(),
    kind: anakUsahaKindSchema.optional(),
    links: z.array(anakUsahaLinkSchema).optional(),
    sortOrder: z.number().int().optional(),
});
