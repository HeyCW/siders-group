import { z } from 'zod';
/**
 * The admin read of the hyperlocal spotlight (specs/hyperlocal-spotlight/spec.md - "Admin read
 * of the current spotlight"). Two things are reported, deliberately kept apart rather than
 * collapsed into one:
 *
 * - `editorPick`: the raw stored pick, `null` when none is set, returned even when the picked
 *   article is not publicly visible (a draft, a future-scheduled article, an unpublished one) —
 *   staff need to see it to know what they chose, not just what the public sees.
 * - `resolved` / `resolvedIsEditorPick`: what the spotlight currently shows in public — the
 *   editor pick when it is publicly visible, otherwise the automatic newest-article fallback, or
 *   `null` when nothing publicly visible exists at all.
 *
 * There is no separate "is there anything to show" field: `resolved === null` already answers
 * that (specs/hyperlocal-spotlight/spec.md - "Nothing to resolve reads as success").
 */
export declare const hyperlocalSpotlightResponseSchema: z.ZodObject<{
    editorPick: z.ZodNullable<z.ZodObject<{
        article: z.ZodObject<{
            id: z.ZodString;
            title: z.ZodString;
            slug: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            id: string;
            slug: string;
            title: string;
        }, {
            id: string;
            slug: string;
            title: string;
        }>;
        status: z.ZodEnum<["draft", "scheduled", "published"]>;
        isPubliclyVisible: z.ZodBoolean;
    }, "strip", z.ZodTypeAny, {
        status: "draft" | "scheduled" | "published";
        article: {
            id: string;
            slug: string;
            title: string;
        };
        isPubliclyVisible: boolean;
    }, {
        status: "draft" | "scheduled" | "published";
        article: {
            id: string;
            slug: string;
            title: string;
        };
        isPubliclyVisible: boolean;
    }>>;
    resolved: z.ZodNullable<z.ZodObject<{
        id: z.ZodString;
        title: z.ZodString;
        slug: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        id: string;
        slug: string;
        title: string;
    }, {
        id: string;
        slug: string;
        title: string;
    }>>;
    resolvedIsEditorPick: z.ZodBoolean;
}, "strip", z.ZodTypeAny, {
    editorPick: {
        status: "draft" | "scheduled" | "published";
        article: {
            id: string;
            slug: string;
            title: string;
        };
        isPubliclyVisible: boolean;
    } | null;
    resolved: {
        id: string;
        slug: string;
        title: string;
    } | null;
    resolvedIsEditorPick: boolean;
}, {
    editorPick: {
        status: "draft" | "scheduled" | "published";
        article: {
            id: string;
            slug: string;
            title: string;
        };
        isPubliclyVisible: boolean;
    } | null;
    resolved: {
        id: string;
        slug: string;
        title: string;
    } | null;
    resolvedIsEditorPick: boolean;
}>;
export type HyperlocalSpotlightResponse = z.infer<typeof hyperlocalSpotlightResponseSchema>;
/**
 * The public read (specs/hyperlocal-spotlight/spec.md - "Public spotlight read"). `article` is
 * the resolved article in the standard public card shape, or `null` when nothing publicly
 * visible exists — never a 404 for an ordinary empty state. `isEditorPick` distinguishes a
 * deliberate pick from the automatic newest-article fallback; the public page does not have to
 * act on it (a fallback renders identically to a pick), but it is there for anyone who does.
 */
export declare const publicHyperlocalSpotlightSchema: z.ZodObject<{
    article: z.ZodNullable<z.ZodObject<{
        id: z.ZodString;
        slug: z.ZodString;
        title: z.ZodString;
        excerpt: z.ZodNullable<z.ZodString>;
        featuredImageUrl: z.ZodNullable<z.ZodString>;
        categories: z.ZodArray<z.ZodObject<{
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
        }>, "many">;
        anakUsaha: z.ZodNullable<z.ZodObject<{
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
        }>>;
        authorName: z.ZodString;
        publishedAt: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        id: string;
        slug: string;
        title: string;
        excerpt: string | null;
        publishedAt: string;
        featuredImageUrl: string | null;
        categories: {
            name: string;
            id: string;
            slug: string;
        }[];
        anakUsaha: {
            name: string;
            id: string;
            slug: string;
        } | null;
        authorName: string;
    }, {
        id: string;
        slug: string;
        title: string;
        excerpt: string | null;
        publishedAt: string;
        featuredImageUrl: string | null;
        categories: {
            name: string;
            id: string;
            slug: string;
        }[];
        anakUsaha: {
            name: string;
            id: string;
            slug: string;
        } | null;
        authorName: string;
    }>>;
    isEditorPick: z.ZodBoolean;
}, "strip", z.ZodTypeAny, {
    article: {
        id: string;
        slug: string;
        title: string;
        excerpt: string | null;
        publishedAt: string;
        featuredImageUrl: string | null;
        categories: {
            name: string;
            id: string;
            slug: string;
        }[];
        anakUsaha: {
            name: string;
            id: string;
            slug: string;
        } | null;
        authorName: string;
    } | null;
    isEditorPick: boolean;
}, {
    article: {
        id: string;
        slug: string;
        title: string;
        excerpt: string | null;
        publishedAt: string;
        featuredImageUrl: string | null;
        categories: {
            name: string;
            id: string;
            slug: string;
        }[];
        anakUsaha: {
            name: string;
            id: string;
            slug: string;
        } | null;
        authorName: string;
    } | null;
    isEditorPick: boolean;
}>;
export type PublicHyperlocalSpotlight = z.infer<typeof publicHyperlocalSpotlightSchema>;
