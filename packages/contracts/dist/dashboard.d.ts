import { z } from 'zod';
/**
 * Fixed at 8 — the trailing-8-week cadence window, including the current partial Jakarta week
 * (openspec/changes/add-admin-dashboard/design.md - "Timezone: Asia/Jakarta, pinned now").
 */
export declare const DASHBOARD_CADENCE_WEEKS = 8;
/**
 * Cap on `upNext.dueWithin48h` — a glance tile, not a full listing. `dueWithin48hTotal` carries
 * the true count so the UI can render "...and N more" without an unbounded response
 * (design.md - "'Up next' folds in worker health as a count, not a separate tile").
 */
export declare const DASHBOARD_DUE_SOON_LIMIT = 20;
export declare const dashboardPipelineSchema: z.ZodObject<{
    draft: z.ZodNumber;
    scheduled: z.ZodNumber;
    published: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    draft: number;
    scheduled: number;
    published: number;
}, {
    draft: number;
    scheduled: number;
    published: number;
}>;
export type DashboardPipeline = z.infer<typeof dashboardPipelineSchema>;
/** `weekStart` is a Jakarta calendar date (`YYYY-MM-DD`), not a UTC-shifted ISO timestamp — see
 *  design.md's "Timezone" decision and tasks.md 2.3 for why it is formatted in SQL. */
export declare const dashboardCadenceBucketSchema: z.ZodObject<{
    weekStart: z.ZodString;
    count: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    count: number;
    weekStart: string;
}, {
    count: number;
    weekStart: string;
}>;
export type DashboardCadenceBucket = z.infer<typeof dashboardCadenceBucketSchema>;
/**
 * No `mediaMissingAlt` — dropped from this change (design.md - "Content debt" decision: nothing
 * in the product writes `media.alt`, so the count would be permanently unactionable, and making
 * it actionable would add a write path this capability's Purpose rules out).
 */
export declare const dashboardContentDebtSchema: z.ZodObject<{
    missingSeoDescription: z.ZodNumber;
    missingExcerpt: z.ZodNumber;
    missingFeaturedImage: z.ZodNumber;
    uncategorized: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    missingSeoDescription: number;
    missingExcerpt: number;
    missingFeaturedImage: number;
    uncategorized: number;
}, {
    missingSeoDescription: number;
    missingExcerpt: number;
    missingFeaturedImage: number;
    uncategorized: number;
}>;
export type DashboardContentDebt = z.infer<typeof dashboardContentDebtSchema>;
export declare const dashboardCurationIntegritySchema: z.ZodObject<{
    home: z.ZodObject<{
        total: z.ZodNumber;
        visible: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        total: number;
        visible: number;
    }, {
        total: number;
        visible: number;
    }>;
}, "strip", z.ZodTypeAny, {
    home: {
        total: number;
        visible: number;
    };
}, {
    home: {
        total: number;
        visible: number;
    };
}>;
export type DashboardCurationIntegrity = z.infer<typeof dashboardCurationIntegritySchema>;
/**
 * Includes `title` and `slug` for not-yet-publicly-visible articles — a deliberate, documented
 * disclosure to any `dashboard.view` holder, not an oversight
 * (specs/admin-dashboard/spec.md - "Upcoming and overdue scheduled articles").
 */
export declare const dashboardUpNextArticleSchema: z.ZodObject<{
    id: z.ZodString;
    title: z.ZodString;
    slug: z.ZodString;
    publishedAt: z.ZodString;
}, "strip", z.ZodTypeAny, {
    id: string;
    slug: string;
    title: string;
    publishedAt: string;
}, {
    id: string;
    slug: string;
    title: string;
    publishedAt: string;
}>;
export type DashboardUpNextArticle = z.infer<typeof dashboardUpNextArticleSchema>;
export declare const dashboardUpNextSchema: z.ZodObject<{
    dueWithin48h: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        title: z.ZodString;
        slug: z.ZodString;
        publishedAt: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        id: string;
        slug: string;
        title: string;
        publishedAt: string;
    }, {
        id: string;
        slug: string;
        title: string;
        publishedAt: string;
    }>, "many">;
    dueWithin48hTotal: z.ZodNumber;
    overdueUnpromotedCount: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    dueWithin48h: {
        id: string;
        slug: string;
        title: string;
        publishedAt: string;
    }[];
    dueWithin48hTotal: number;
    overdueUnpromotedCount: number;
}, {
    dueWithin48h: {
        id: string;
        slug: string;
        title: string;
        publishedAt: string;
    }[];
    dueWithin48hTotal: number;
    overdueUnpromotedCount: number;
}>;
export type DashboardUpNext = z.infer<typeof dashboardUpNextSchema>;
/** Sign-in activity, not traffic — see design.md's "Readers tile" decision for why the label
 *  matters (specs/admin-dashboard/spec.md - "Reader growth and activity"). */
export declare const dashboardReadersSchema: z.ZodObject<{
    newLast7d: z.ZodNumber;
    activeLast30d: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    newLast7d: number;
    activeLast30d: number;
}, {
    newLast7d: number;
    activeLast30d: number;
}>;
export type DashboardReaders = z.infer<typeof dashboardReadersSchema>;
/**
 * Cap on `readership.topArticles` — a glance tile, like `upNext.dueWithin48h`. There is no
 * accompanying total: "the five most-read" is the whole question, and how many articles had any
 * reads at all is not something this section is asked
 * (specs/admin-dashboard/spec.md - "The listing is bounded").
 */
export declare const DASHBOARD_TOP_ARTICLES_LIMIT = 5;
export declare const dashboardTopArticleSchema: z.ZodObject<{
    id: z.ZodString;
    title: z.ZodString;
    slug: z.ZodString;
    views: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    id: string;
    slug: string;
    title: string;
    views: number;
}, {
    id: string;
    slug: string;
    title: string;
    views: number;
}>;
export type DashboardTopArticle = z.infer<typeof dashboardTopArticleSchema>;
/**
 * Traffic, not sign-in activity — the complement of `dashboardReadersSchema`, which counts
 * accounts. `last7dUniqueViews` is deduplicated per visitor per day, so a visitor returning on
 * three days counts three times across a 7-day window; it is "unique visits per day, summed",
 * not "distinct people this week" (design.md - "View counting").
 */
export declare const dashboardReadershipSchema: z.ZodObject<{
    last7dViews: z.ZodNumber;
    last7dUniqueViews: z.ZodNumber;
    topArticles: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        title: z.ZodString;
        slug: z.ZodString;
        views: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        id: string;
        slug: string;
        title: string;
        views: number;
    }, {
        id: string;
        slug: string;
        title: string;
        views: number;
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    last7dViews: number;
    last7dUniqueViews: number;
    topArticles: {
        id: string;
        slug: string;
        title: string;
        views: number;
    }[];
}, {
    last7dViews: number;
    last7dUniqueViews: number;
    topArticles: {
        id: string;
        slug: string;
        title: string;
        views: number;
    }[];
}>;
export type DashboardReadership = z.infer<typeof dashboardReadershipSchema>;
export declare const dashboardResponseSchema: z.ZodObject<{
    pipeline: z.ZodObject<{
        draft: z.ZodNumber;
        scheduled: z.ZodNumber;
        published: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        draft: number;
        scheduled: number;
        published: number;
    }, {
        draft: number;
        scheduled: number;
        published: number;
    }>;
    cadence: z.ZodArray<z.ZodObject<{
        weekStart: z.ZodString;
        count: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        count: number;
        weekStart: string;
    }, {
        count: number;
        weekStart: string;
    }>, "many">;
    contentDebt: z.ZodObject<{
        missingSeoDescription: z.ZodNumber;
        missingExcerpt: z.ZodNumber;
        missingFeaturedImage: z.ZodNumber;
        uncategorized: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        missingSeoDescription: number;
        missingExcerpt: number;
        missingFeaturedImage: number;
        uncategorized: number;
    }, {
        missingSeoDescription: number;
        missingExcerpt: number;
        missingFeaturedImage: number;
        uncategorized: number;
    }>;
    curationIntegrity: z.ZodObject<{
        home: z.ZodObject<{
            total: z.ZodNumber;
            visible: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            total: number;
            visible: number;
        }, {
            total: number;
            visible: number;
        }>;
    }, "strip", z.ZodTypeAny, {
        home: {
            total: number;
            visible: number;
        };
    }, {
        home: {
            total: number;
            visible: number;
        };
    }>;
    upNext: z.ZodObject<{
        dueWithin48h: z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            title: z.ZodString;
            slug: z.ZodString;
            publishedAt: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            id: string;
            slug: string;
            title: string;
            publishedAt: string;
        }, {
            id: string;
            slug: string;
            title: string;
            publishedAt: string;
        }>, "many">;
        dueWithin48hTotal: z.ZodNumber;
        overdueUnpromotedCount: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        dueWithin48h: {
            id: string;
            slug: string;
            title: string;
            publishedAt: string;
        }[];
        dueWithin48hTotal: number;
        overdueUnpromotedCount: number;
    }, {
        dueWithin48h: {
            id: string;
            slug: string;
            title: string;
            publishedAt: string;
        }[];
        dueWithin48hTotal: number;
        overdueUnpromotedCount: number;
    }>;
    readers: z.ZodObject<{
        newLast7d: z.ZodNumber;
        activeLast30d: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        newLast7d: number;
        activeLast30d: number;
    }, {
        newLast7d: number;
        activeLast30d: number;
    }>;
    readership: z.ZodObject<{
        last7dViews: z.ZodNumber;
        last7dUniqueViews: z.ZodNumber;
        topArticles: z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            title: z.ZodString;
            slug: z.ZodString;
            views: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            id: string;
            slug: string;
            title: string;
            views: number;
        }, {
            id: string;
            slug: string;
            title: string;
            views: number;
        }>, "many">;
    }, "strip", z.ZodTypeAny, {
        last7dViews: number;
        last7dUniqueViews: number;
        topArticles: {
            id: string;
            slug: string;
            title: string;
            views: number;
        }[];
    }, {
        last7dViews: number;
        last7dUniqueViews: number;
        topArticles: {
            id: string;
            slug: string;
            title: string;
            views: number;
        }[];
    }>;
}, "strip", z.ZodTypeAny, {
    pipeline: {
        draft: number;
        scheduled: number;
        published: number;
    };
    cadence: {
        count: number;
        weekStart: string;
    }[];
    contentDebt: {
        missingSeoDescription: number;
        missingExcerpt: number;
        missingFeaturedImage: number;
        uncategorized: number;
    };
    curationIntegrity: {
        home: {
            total: number;
            visible: number;
        };
    };
    upNext: {
        dueWithin48h: {
            id: string;
            slug: string;
            title: string;
            publishedAt: string;
        }[];
        dueWithin48hTotal: number;
        overdueUnpromotedCount: number;
    };
    readers: {
        newLast7d: number;
        activeLast30d: number;
    };
    readership: {
        last7dViews: number;
        last7dUniqueViews: number;
        topArticles: {
            id: string;
            slug: string;
            title: string;
            views: number;
        }[];
    };
}, {
    pipeline: {
        draft: number;
        scheduled: number;
        published: number;
    };
    cadence: {
        count: number;
        weekStart: string;
    }[];
    contentDebt: {
        missingSeoDescription: number;
        missingExcerpt: number;
        missingFeaturedImage: number;
        uncategorized: number;
    };
    curationIntegrity: {
        home: {
            total: number;
            visible: number;
        };
    };
    upNext: {
        dueWithin48h: {
            id: string;
            slug: string;
            title: string;
            publishedAt: string;
        }[];
        dueWithin48hTotal: number;
        overdueUnpromotedCount: number;
    };
    readers: {
        newLast7d: number;
        activeLast30d: number;
    };
    readership: {
        last7dViews: number;
        last7dUniqueViews: number;
        topArticles: {
            id: string;
            slug: string;
            title: string;
            views: number;
        }[];
    };
}>;
export type DashboardResponse = z.infer<typeof dashboardResponseSchema>;
