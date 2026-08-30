import { z } from 'zod';
/** Manual slug overrides go through the same shape the auto-generator produces. */
export declare const articleSlugSchema: z.ZodString;
/**
 * The editor's Tiptap/ProseMirror document. Deliberately unconstrained in shape — `sanitizeHtml`
 * is the layer that enforces meaning, and treats anything it doesn't recognize as absent
 * (design.md - Risks: "ProseMirror JSON schema evolution" is out of scope for this change).
 */
export declare const articleBodyJsonSchema: z.ZodUnknown;
/**
 * Full article edit. No `author_id` field exists here or anywhere below — the author is always
 * the authenticated session (specs/article-management/spec.md - "Author derived from session").
 * `slug` is accepted for a manual override; auto-generation from the title happens server-side
 * only when the article has no slug yet (design.md - "Slug generation").
 */
export declare const articleWriteFieldsSchema: z.ZodObject<{
    title: z.ZodString;
    slug: z.ZodOptional<z.ZodString>;
    bodyJson: z.ZodOptional<z.ZodUnknown>;
    excerpt: z.ZodOptional<z.ZodString>;
    categoryIds: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    featuredMediaId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    anakUsahaId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    seoTitle: z.ZodOptional<z.ZodString>;
    seoDescription: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    title: string;
    slug?: string | undefined;
    bodyJson?: unknown;
    excerpt?: string | undefined;
    categoryIds?: string[] | undefined;
    featuredMediaId?: string | null | undefined;
    anakUsahaId?: string | null | undefined;
    seoTitle?: string | undefined;
    seoDescription?: string | undefined;
}, {
    title: string;
    slug?: string | undefined;
    bodyJson?: unknown;
    excerpt?: string | undefined;
    categoryIds?: string[] | undefined;
    featuredMediaId?: string | null | undefined;
    anakUsahaId?: string | null | undefined;
    seoTitle?: string | undefined;
    seoDescription?: string | undefined;
}>;
export declare const articleCreateRequestSchema: z.ZodObject<{
    title: z.ZodString;
    slug: z.ZodOptional<z.ZodString>;
    bodyJson: z.ZodOptional<z.ZodUnknown>;
    excerpt: z.ZodOptional<z.ZodString>;
    categoryIds: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    featuredMediaId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    anakUsahaId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    seoTitle: z.ZodOptional<z.ZodString>;
    seoDescription: z.ZodOptional<z.ZodString>;
}, "strict", z.ZodTypeAny, {
    title: string;
    slug?: string | undefined;
    bodyJson?: unknown;
    excerpt?: string | undefined;
    categoryIds?: string[] | undefined;
    featuredMediaId?: string | null | undefined;
    anakUsahaId?: string | null | undefined;
    seoTitle?: string | undefined;
    seoDescription?: string | undefined;
}, {
    title: string;
    slug?: string | undefined;
    bodyJson?: unknown;
    excerpt?: string | undefined;
    categoryIds?: string[] | undefined;
    featuredMediaId?: string | null | undefined;
    anakUsahaId?: string | null | undefined;
    seoTitle?: string | undefined;
    seoDescription?: string | undefined;
}>;
export type ArticleCreateRequest = z.infer<typeof articleCreateRequestSchema>;
export declare const articleUpdateRequestSchema: z.ZodObject<{
    title: z.ZodOptional<z.ZodString>;
    slug: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    bodyJson: z.ZodOptional<z.ZodOptional<z.ZodUnknown>>;
    excerpt: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    categoryIds: z.ZodOptional<z.ZodOptional<z.ZodArray<z.ZodString, "many">>>;
    featuredMediaId: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    anakUsahaId: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    seoTitle: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    seoDescription: z.ZodOptional<z.ZodOptional<z.ZodString>>;
}, "strict", z.ZodTypeAny, {
    slug?: string | undefined;
    title?: string | undefined;
    bodyJson?: unknown;
    excerpt?: string | undefined;
    categoryIds?: string[] | undefined;
    featuredMediaId?: string | null | undefined;
    anakUsahaId?: string | null | undefined;
    seoTitle?: string | undefined;
    seoDescription?: string | undefined;
}, {
    slug?: string | undefined;
    title?: string | undefined;
    bodyJson?: unknown;
    excerpt?: string | undefined;
    categoryIds?: string[] | undefined;
    featuredMediaId?: string | null | undefined;
    anakUsahaId?: string | null | undefined;
    seoTitle?: string | undefined;
    seoDescription?: string | undefined;
}>;
export type ArticleUpdateRequest = z.infer<typeof articleUpdateRequestSchema>;
/**
 * Autosave is deliberately a narrower schema than the general update — it has no `slug` field
 * and no status-changing field at all, so an autosave request structurally cannot move the
 * slug or the status even if a client tried (design.md - "Autosave never changes the slug",
 * specs/article-management/spec.md - "Autosave never alters the slug").
 */
export declare const articleAutosaveRequestSchema: z.ZodObject<{
    title: z.ZodOptional<z.ZodString>;
    bodyJson: z.ZodOptional<z.ZodUnknown>;
    excerpt: z.ZodOptional<z.ZodString>;
    categoryIds: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    featuredMediaId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    anakUsahaId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    seoTitle: z.ZodOptional<z.ZodString>;
    seoDescription: z.ZodOptional<z.ZodString>;
}, "strict", z.ZodTypeAny, {
    title?: string | undefined;
    bodyJson?: unknown;
    excerpt?: string | undefined;
    categoryIds?: string[] | undefined;
    featuredMediaId?: string | null | undefined;
    anakUsahaId?: string | null | undefined;
    seoTitle?: string | undefined;
    seoDescription?: string | undefined;
}, {
    title?: string | undefined;
    bodyJson?: unknown;
    excerpt?: string | undefined;
    categoryIds?: string[] | undefined;
    featuredMediaId?: string | null | undefined;
    anakUsahaId?: string | null | undefined;
    seoTitle?: string | undefined;
    seoDescription?: string | undefined;
}>;
export type ArticleAutosaveRequest = z.infer<typeof articleAutosaveRequestSchema>;
/** Publish and unpublish take no body — the transition itself is the entire request. */
export declare const articleScheduleRequestSchema: z.ZodObject<{
    publishedAt: z.ZodString;
}, "strict", z.ZodTypeAny, {
    publishedAt: string;
}, {
    publishedAt: string;
}>;
export type ArticleScheduleRequest = z.infer<typeof articleScheduleRequestSchema>;
export declare const DEFAULT_PUBLIC_LIST_LIMIT = 20;
export declare const MAX_PUBLIC_LIST_LIMIT = 100;
export declare const articlePublicListQuerySchema: z.ZodObject<{
    limit: z.ZodEffects<z.ZodDefault<z.ZodNumber>, number, number | undefined>;
    offset: z.ZodDefault<z.ZodNumber>;
    categorySlugs: z.ZodEffects<z.ZodOptional<z.ZodArray<z.ZodString, "many">>, string[] | undefined, unknown>;
    anakUsahaSlugs: z.ZodEffects<z.ZodOptional<z.ZodArray<z.ZodString, "many">>, string[] | undefined, unknown>;
    publishedAfter: z.ZodOptional<z.ZodDate>;
    publishedBefore: z.ZodOptional<z.ZodDate>;
    excludeIds: z.ZodEffects<z.ZodOptional<z.ZodArray<z.ZodString, "many">>, string[] | undefined, unknown>;
    order: z.ZodDefault<z.ZodEnum<["newest", "oldest"]>>;
}, "strip", z.ZodTypeAny, {
    limit: number;
    offset: number;
    order: "newest" | "oldest";
    categorySlugs?: string[] | undefined;
    anakUsahaSlugs?: string[] | undefined;
    publishedAfter?: Date | undefined;
    publishedBefore?: Date | undefined;
    excludeIds?: string[] | undefined;
}, {
    limit?: number | undefined;
    offset?: number | undefined;
    categorySlugs?: unknown;
    anakUsahaSlugs?: unknown;
    publishedAfter?: Date | undefined;
    publishedBefore?: Date | undefined;
    excludeIds?: unknown;
    order?: "newest" | "oldest" | undefined;
}>;
export type ArticlePublicListQuery = z.infer<typeof articlePublicListQuerySchema>;
/** The card shape used by both the public list and by any consumer composing a listing page. */
export declare const articlePublicCardSchema: z.ZodObject<{
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
}>;
export type ArticlePublicCard = z.infer<typeof articlePublicCardSchema>;
/**
 * The by-slug detail response. Carries `bodyHtml` and never `bodyJson`
 * (specs/article-management/spec.md - "Only sanitized HTML is served publicly").
 */
export declare const articlePublicDetailSchema: z.ZodObject<{
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
} & {
    bodyHtml: z.ZodString;
    seoTitle: z.ZodNullable<z.ZodString>;
    seoDescription: z.ZodNullable<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    id: string;
    slug: string;
    title: string;
    excerpt: string | null;
    seoTitle: string | null;
    seoDescription: string | null;
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
    bodyHtml: string;
}, {
    id: string;
    slug: string;
    title: string;
    excerpt: string | null;
    seoTitle: string | null;
    seoDescription: string | null;
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
    bodyHtml: string;
}>;
export type ArticlePublicDetail = z.infer<typeof articlePublicDetailSchema>;
/** The admin-facing shape: everything the public gets, plus authoring state and `bodyJson`. */
export declare const articleAdminResponseSchema: z.ZodObject<{
    id: z.ZodString;
    title: z.ZodString;
    slug: z.ZodString;
    bodyJson: z.ZodUnknown;
    bodyHtml: z.ZodString;
    excerpt: z.ZodNullable<z.ZodString>;
    status: z.ZodEnum<["draft", "scheduled", "published"]>;
    authorId: z.ZodString;
    authorName: z.ZodString;
    featuredMediaId: z.ZodNullable<z.ZodString>;
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
    seoTitle: z.ZodNullable<z.ZodString>;
    seoDescription: z.ZodNullable<z.ZodString>;
    publishedAt: z.ZodNullable<z.ZodString>;
    createdAt: z.ZodString;
    updatedAt: z.ZodString;
}, "strip", z.ZodTypeAny, {
    status: "draft" | "scheduled" | "published";
    id: string;
    createdAt: string;
    updatedAt: string;
    slug: string;
    title: string;
    excerpt: string | null;
    featuredMediaId: string | null;
    seoTitle: string | null;
    seoDescription: string | null;
    publishedAt: string | null;
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
    bodyHtml: string;
    authorId: string;
    bodyJson?: unknown;
}, {
    status: "draft" | "scheduled" | "published";
    id: string;
    createdAt: string;
    updatedAt: string;
    slug: string;
    title: string;
    excerpt: string | null;
    featuredMediaId: string | null;
    seoTitle: string | null;
    seoDescription: string | null;
    publishedAt: string | null;
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
    bodyHtml: string;
    authorId: string;
    bodyJson?: unknown;
}>;
export type ArticleAdminResponse = z.infer<typeof articleAdminResponseSchema>;
