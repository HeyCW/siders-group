import { z } from 'zod';
export declare const anakUsahaCreateRequestSchema: z.ZodObject<{
    name: z.ZodString;
}, "strict", z.ZodTypeAny, {
    name: string;
}, {
    name: string;
}>;
export type AnakUsahaCreateRequest = z.infer<typeof anakUsahaCreateRequestSchema>;
export declare const anakUsahaUpdateRequestSchema: z.ZodObject<{
    name: z.ZodString;
}, "strict", z.ZodTypeAny, {
    name: string;
}, {
    name: string;
}>;
export type AnakUsahaUpdateRequest = z.infer<typeof anakUsahaUpdateRequestSchema>;
export declare const anakUsahaResponseSchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    slug: z.ZodString;
}, "strip", z.ZodTypeAny, {
    name: string;
    id: string;
    slug: string;
}, {
    name: string;
    id: string;
    slug: string;
}>;
export type AnakUsahaResponse = z.infer<typeof anakUsahaResponseSchema>;
/**
 * The fixed set of groupings the public site's masthead logo row (`ConnectedPlatforms.tsx`)
 * filters by. Kept as a Zod enum rather than a Postgres enum (design.md - "kind as a text column
 * with contract-level validation") so a typo can never silently drop a brand from that grouping
 * the way a free-text column would.
 */
export declare const anakUsahaKindSchema: z.ZodEnum<["Media Platform", "News & Community"]>;
export type AnakUsahaKind = z.infer<typeof anakUsahaKindSchema>;
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
export declare const hexColorSchema: z.ZodString;
export declare const anakUsahaLinkSchema: z.ZodObject<{
    label: z.ZodString;
    href: z.ZodEffects<z.ZodString, string, string>;
}, "strict", z.ZodTypeAny, {
    label: string;
    href: string;
}, {
    label: string;
    href: string;
}>;
export type AnakUsahaLink = z.infer<typeof anakUsahaLinkSchema>;
/**
 * Which taxonomy entry the profile presents is the `:id` in the route
 * (`POST /anak-usaha/:id/profile`), not a body field — carrying it in both places would only
 * invite a mismatch between the two. The entry must already exist
 * (specs/anak-usaha-presentation/spec.md - "A profile presents exactly one anak usaha entry"),
 * enforced by the service layer against `anak_usaha`. `logoMediaId` is nullable, unlike
 * `partnerCreateRequestSchema.logoMediaId` (design.md - "Logo FK is nullable").
 */
export declare const anakUsahaProfileCreateRequestSchema: z.ZodObject<{
    logoMediaId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    backgroundColor: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    description: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    kind: z.ZodEnum<["Media Platform", "News & Community"]>;
    links: z.ZodOptional<z.ZodArray<z.ZodObject<{
        label: z.ZodString;
        href: z.ZodEffects<z.ZodString, string, string>;
    }, "strict", z.ZodTypeAny, {
        label: string;
        href: string;
    }, {
        label: string;
        href: string;
    }>, "many">>;
}, "strict", z.ZodTypeAny, {
    kind: "Media Platform" | "News & Community";
    logoMediaId?: string | null | undefined;
    backgroundColor?: string | null | undefined;
    description?: string | null | undefined;
    links?: {
        label: string;
        href: string;
    }[] | undefined;
}, {
    kind: "Media Platform" | "News & Community";
    logoMediaId?: string | null | undefined;
    backgroundColor?: string | null | undefined;
    description?: string | null | undefined;
    links?: {
        label: string;
        href: string;
    }[] | undefined;
}>;
export type AnakUsahaProfileCreateRequest = z.infer<typeof anakUsahaProfileCreateRequestSchema>;
/**
 * All fields optional for a partial update. `sortOrder` is deliberately absent, same as
 * `partnerUpdateRequestSchema` — order changes only through the dedicated reorder endpoint
 * (specs/anak-usaha-presentation/spec.md - "Profile order is replaced as a whole list").
 */
export declare const anakUsahaProfileUpdateRequestSchema: z.ZodObject<{
    logoMediaId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    backgroundColor: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    description: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    kind: z.ZodOptional<z.ZodEnum<["Media Platform", "News & Community"]>>;
    links: z.ZodOptional<z.ZodArray<z.ZodObject<{
        label: z.ZodString;
        href: z.ZodEffects<z.ZodString, string, string>;
    }, "strict", z.ZodTypeAny, {
        label: string;
        href: string;
    }, {
        label: string;
        href: string;
    }>, "many">>;
    isActive: z.ZodOptional<z.ZodBoolean>;
}, "strict", z.ZodTypeAny, {
    logoMediaId?: string | null | undefined;
    isActive?: boolean | undefined;
    backgroundColor?: string | null | undefined;
    description?: string | null | undefined;
    kind?: "Media Platform" | "News & Community" | undefined;
    links?: {
        label: string;
        href: string;
    }[] | undefined;
}, {
    logoMediaId?: string | null | undefined;
    isActive?: boolean | undefined;
    backgroundColor?: string | null | undefined;
    description?: string | null | undefined;
    kind?: "Media Platform" | "News & Community" | undefined;
    links?: {
        label: string;
        href: string;
    }[] | undefined;
}>;
export type AnakUsahaProfileUpdateRequest = z.infer<typeof anakUsahaProfileUpdateRequestSchema>;
/**
 * Whole-list replacement, identical shape to `partnerReorderRequestSchema`
 * (specs/anak-usaha-presentation/spec.md - "Profile order is replaced as a whole list"). Each id
 * is the `anakUsahaId` a profile belongs to, since the profile has no separate id of its own.
 */
export declare const anakUsahaProfileReorderRequestSchema: z.ZodObject<{
    anakUsahaIds: z.ZodEffects<z.ZodArray<z.ZodString, "many">, string[], string[]>;
}, "strict", z.ZodTypeAny, {
    anakUsahaIds: string[];
}, {
    anakUsahaIds: string[];
}>;
export type AnakUsahaProfileReorderRequest = z.infer<typeof anakUsahaProfileReorderRequestSchema>;
/**
 * The profile fields as returned to callers, nested rather than flattened onto the taxonomy shape
 * so "this entry has no profile yet" is exactly `profile: null`, not a set of blank fields.
 */
export declare const anakUsahaProfileFieldsSchema: z.ZodObject<{
    logoUrl: z.ZodNullable<z.ZodString>;
    backgroundColor: z.ZodNullable<z.ZodString>;
    description: z.ZodNullable<z.ZodString>;
    kind: z.ZodEnum<["Media Platform", "News & Community"]>;
    links: z.ZodArray<z.ZodObject<{
        label: z.ZodString;
        href: z.ZodEffects<z.ZodString, string, string>;
    }, "strict", z.ZodTypeAny, {
        label: string;
        href: string;
    }, {
        label: string;
        href: string;
    }>, "many">;
    sortOrder: z.ZodNumber;
    isActive: z.ZodBoolean;
}, "strip", z.ZodTypeAny, {
    isActive: boolean;
    logoUrl: string | null;
    sortOrder: number;
    backgroundColor: string | null;
    description: string | null;
    kind: "Media Platform" | "News & Community";
    links: {
        label: string;
        href: string;
    }[];
}, {
    isActive: boolean;
    logoUrl: string | null;
    sortOrder: number;
    backgroundColor: string | null;
    description: string | null;
    kind: "Media Platform" | "News & Community";
    links: {
        label: string;
        href: string;
    }[];
}>;
export type AnakUsahaProfileFields = z.infer<typeof anakUsahaProfileFieldsSchema>;
/**
 * The admin shape: every taxonomy entry plus its profile, or `null` when it has none — lets the
 * new admin screen show every anak usaha entry and offer to create a profile for the ones
 * without (specs/anak-usaha-presentation/spec.md).
 */
export declare const anakUsahaAdminResponseSchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    slug: z.ZodString;
} & {
    profile: z.ZodNullable<z.ZodObject<{
        logoUrl: z.ZodNullable<z.ZodString>;
        backgroundColor: z.ZodNullable<z.ZodString>;
        description: z.ZodNullable<z.ZodString>;
        kind: z.ZodEnum<["Media Platform", "News & Community"]>;
        links: z.ZodArray<z.ZodObject<{
            label: z.ZodString;
            href: z.ZodEffects<z.ZodString, string, string>;
        }, "strict", z.ZodTypeAny, {
            label: string;
            href: string;
        }, {
            label: string;
            href: string;
        }>, "many">;
        sortOrder: z.ZodNumber;
        isActive: z.ZodBoolean;
    }, "strip", z.ZodTypeAny, {
        isActive: boolean;
        logoUrl: string | null;
        sortOrder: number;
        backgroundColor: string | null;
        description: string | null;
        kind: "Media Platform" | "News & Community";
        links: {
            label: string;
            href: string;
        }[];
    }, {
        isActive: boolean;
        logoUrl: string | null;
        sortOrder: number;
        backgroundColor: string | null;
        description: string | null;
        kind: "Media Platform" | "News & Community";
        links: {
            label: string;
            href: string;
        }[];
    }>>;
}, "strip", z.ZodTypeAny, {
    name: string;
    id: string;
    slug: string;
    profile: {
        isActive: boolean;
        logoUrl: string | null;
        sortOrder: number;
        backgroundColor: string | null;
        description: string | null;
        kind: "Media Platform" | "News & Community";
        links: {
            label: string;
            href: string;
        }[];
    } | null;
}, {
    name: string;
    id: string;
    slug: string;
    profile: {
        isActive: boolean;
        logoUrl: string | null;
        sortOrder: number;
        backgroundColor: string | null;
        description: string | null;
        kind: "Media Platform" | "News & Community";
        links: {
            label: string;
            href: string;
        }[];
    } | null;
}>;
export type AnakUsahaAdminResponse = z.infer<typeof anakUsahaAdminResponseSchema>;
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
export declare const publicAnakUsahaSchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    slug: z.ZodString;
} & {
    logoUrl: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    backgroundColor: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    description: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    kind: z.ZodOptional<z.ZodEnum<["Media Platform", "News & Community"]>>;
    links: z.ZodOptional<z.ZodArray<z.ZodObject<{
        label: z.ZodString;
        href: z.ZodEffects<z.ZodString, string, string>;
    }, "strict", z.ZodTypeAny, {
        label: string;
        href: string;
    }, {
        label: string;
        href: string;
    }>, "many">>;
    sortOrder: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    name: string;
    id: string;
    slug: string;
    logoUrl?: string | null | undefined;
    sortOrder?: number | undefined;
    backgroundColor?: string | null | undefined;
    description?: string | null | undefined;
    kind?: "Media Platform" | "News & Community" | undefined;
    links?: {
        label: string;
        href: string;
    }[] | undefined;
}, {
    name: string;
    id: string;
    slug: string;
    logoUrl?: string | null | undefined;
    sortOrder?: number | undefined;
    backgroundColor?: string | null | undefined;
    description?: string | null | undefined;
    kind?: "Media Platform" | "News & Community" | undefined;
    links?: {
        label: string;
        href: string;
    }[] | undefined;
}>;
export type PublicAnakUsaha = z.infer<typeof publicAnakUsahaSchema>;
