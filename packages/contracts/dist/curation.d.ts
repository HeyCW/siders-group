import { z } from 'zod';
/**
 * The homepage curation list caps at 10 entries (specs/home-curation/spec.md - "Curated list
 * validation"). There
 * is deliberately no minimum: an empty list is valid and the homepage falls back to a purely
 * chronological feed.
 */
export declare const MAX_HOME_CURATION_ENTRIES = 10;
/**
 * Whole-list replacement, not a per-item operation (specs/home-curation/spec.md - "Curation is
 * replaced as a whole list"). The client submits an order; the server derives each entry's
 * position from its place in this array, so `position` is never accepted from the client.
 * Duplicate ids are rejected here, at the contract boundary, rather than left to a database
 * constraint further down.
 */
export declare const homeCurationReplaceRequestSchema: z.ZodObject<{
    articleIds: z.ZodEffects<z.ZodArray<z.ZodString, "many">, string[], string[]>;
}, "strict", z.ZodTypeAny, {
    articleIds: string[];
}, {
    articleIds: string[];
}>;
export type HomeCurationReplaceRequest = z.infer<typeof homeCurationReplaceRequestSchema>;
export declare const homeCurationArticleSummarySchema: z.ZodObject<{
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
export type HomeCurationArticleSummary = z.infer<typeof homeCurationArticleSummarySchema>;
/**
 * The admin-only shape: every stored entry, including ones referencing a draft or
 * future-scheduled article, with enough information for the admin screen to badge a pick as
 * not-yet-live rather than leave the editor guessing
 * (specs/home-curation/spec.md - "Admin reads report each entry's visibility").
 */
export declare const homeCurationEntryResponseSchema: z.ZodObject<{
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
    position: z.ZodNumber;
    isPubliclyVisible: z.ZodBoolean;
}, "strip", z.ZodTypeAny, {
    status: "draft" | "scheduled" | "published";
    article: {
        id: string;
        slug: string;
        title: string;
    };
    position: number;
    isPubliclyVisible: boolean;
}, {
    status: "draft" | "scheduled" | "published";
    article: {
        id: string;
        slug: string;
        title: string;
    };
    position: number;
    isPubliclyVisible: boolean;
}>;
export type HomeCurationEntryResponse = z.infer<typeof homeCurationEntryResponseSchema>;
/**
 * Consistent with the public article list endpoint's own default and cap
 * (specs/home-curation/spec.md - "Public homepage feed composes curated picks with chronological
 * backfill"; tasks.md - 2.5).
 */
export declare const homeFeedQuerySchema: z.ZodObject<{
    limit: z.ZodEffects<z.ZodDefault<z.ZodNumber>, number, number | undefined>;
}, "strip", z.ZodTypeAny, {
    limit: number;
}, {
    limit?: number | undefined;
}>;
export type HomeFeedQuery = z.infer<typeof homeFeedQuerySchema>;
