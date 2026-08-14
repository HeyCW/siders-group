import { z } from 'zod';

/**
 * Fixed at 8 — the trailing-8-week cadence window, including the current partial Jakarta week
 * (openspec/changes/add-admin-dashboard/design.md - "Timezone: Asia/Jakarta, pinned now").
 */
export const DASHBOARD_CADENCE_WEEKS = 8;

/**
 * Cap on `upNext.dueWithin48h` — a glance tile, not a full listing. `dueWithin48hTotal` carries
 * the true count so the UI can render "...and N more" without an unbounded response
 * (design.md - "'Up next' folds in worker health as a count, not a separate tile").
 */
export const DASHBOARD_DUE_SOON_LIMIT = 20;

export const dashboardPipelineSchema = z.object({
  draft: z.number().int().nonnegative(),
  scheduled: z.number().int().nonnegative(),
  published: z.number().int().nonnegative(),
});
export type DashboardPipeline = z.infer<typeof dashboardPipelineSchema>;

/** `weekStart` is a Jakarta calendar date (`YYYY-MM-DD`), not a UTC-shifted ISO timestamp — see
 *  design.md's "Timezone" decision and tasks.md 2.3 for why it is formatted in SQL. */
export const dashboardCadenceBucketSchema = z.object({
  weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  count: z.number().int().nonnegative(),
});
export type DashboardCadenceBucket = z.infer<typeof dashboardCadenceBucketSchema>;

/**
 * No `mediaMissingAlt` — dropped from this change (design.md - "Content debt" decision: nothing
 * in the product writes `media.alt`, so the count would be permanently unactionable, and making
 * it actionable would add a write path this capability's Purpose rules out).
 */
export const dashboardContentDebtSchema = z.object({
  missingSeoDescription: z.number().int().nonnegative(),
  missingExcerpt: z.number().int().nonnegative(),
  missingFeaturedImage: z.number().int().nonnegative(),
  uncategorized: z.number().int().nonnegative(),
  unusedTags: z.number().int().nonnegative(),
});
export type DashboardContentDebt = z.infer<typeof dashboardContentDebtSchema>;

const curationIntegrityCountsSchema = z.object({
  total: z.number().int().nonnegative(),
  visible: z.number().int().nonnegative(),
});

export const dashboardCurationIntegritySchema = z.object({
  home: curationIntegrityCountsSchema,
  reels: curationIntegrityCountsSchema,
});
export type DashboardCurationIntegrity = z.infer<typeof dashboardCurationIntegritySchema>;

/**
 * Includes `title` and `slug` for not-yet-publicly-visible articles — a deliberate, documented
 * disclosure to any `dashboard.view` holder, not an oversight
 * (specs/admin-dashboard/spec.md - "Upcoming and overdue scheduled articles").
 */
export const dashboardUpNextArticleSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  slug: z.string(),
  publishedAt: z.string().datetime(),
});
export type DashboardUpNextArticle = z.infer<typeof dashboardUpNextArticleSchema>;

export const dashboardUpNextSchema = z.object({
  dueWithin48h: z.array(dashboardUpNextArticleSchema).max(DASHBOARD_DUE_SOON_LIMIT),
  dueWithin48hTotal: z.number().int().nonnegative(),
  overdueUnpromotedCount: z.number().int().nonnegative(),
});
export type DashboardUpNext = z.infer<typeof dashboardUpNextSchema>;

/** Sign-in activity, not traffic — see design.md's "Readers tile" decision for why the label
 *  matters (specs/admin-dashboard/spec.md - "Reader growth and activity"). */
export const dashboardReadersSchema = z.object({
  newLast7d: z.number().int().nonnegative(),
  activeLast30d: z.number().int().nonnegative(),
});
export type DashboardReaders = z.infer<typeof dashboardReadersSchema>;

export const dashboardResponseSchema = z.object({
  pipeline: dashboardPipelineSchema,
  cadence: z.array(dashboardCadenceBucketSchema).length(DASHBOARD_CADENCE_WEEKS),
  contentDebt: dashboardContentDebtSchema,
  curationIntegrity: dashboardCurationIntegritySchema,
  upNext: dashboardUpNextSchema,
  readers: dashboardReadersSchema,
});
export type DashboardResponse = z.infer<typeof dashboardResponseSchema>;
