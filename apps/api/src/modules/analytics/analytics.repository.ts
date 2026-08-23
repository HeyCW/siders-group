import { and, asc, count, eq, gte, isNull, lt, lte, notExists, or, sql } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import {
  articles,
  articleCategories,
  articleViewsDaily,
  readers,
  homeCuration,
  type Database,
} from '@siders/db';
import { DASHBOARD_CADENCE_WEEKS, DASHBOARD_DUE_SOON_LIMIT, DASHBOARD_TOP_ARTICLES_LIMIT } from '@siders/contracts';
import { isPubliclyVisible } from '../articles/article.repository.js';

/** Grace period against the one-minute publish-worker cron, so a normally-running worker never
 *  shows up as overdue (design.md - "'Up next' folds in worker health as a count"). */
const OVERDUE_GRACE_MS = 5 * 60 * 1000;
const DUE_SOON_WINDOW_MS = 48 * 60 * 60 * 1000;
const NEW_READER_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const ACTIVE_READER_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

const JAKARTA_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

/** Both readership windows are inclusive of the current Jakarta day. */
const READERSHIP_TOTALS_DAYS = 7;
const READERSHIP_TOP_DAYS = 30;

/**
 * The start (Monday 00:00 Jakarta time, expressed as the real UTC instant) of the Jakarta
 * calendar week containing `instant`. Asia/Jakarta carries no DST, so a fixed +07:00 shift is
 * exact — there is no historical or future offset change to account for
 * (design.md - "Weeks start Monday").
 */
export function jakartaWeekStart(instant: Date): Date {
  const shifted = new Date(instant.getTime() + JAKARTA_OFFSET_MS);
  const dayOfWeek = shifted.getUTCDay(); // 0 = Sunday
  const daysSinceMonday = (dayOfWeek + 6) % 7;
  const shiftedWeekStartMs = Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate() - daysSinceMonday);
  return new Date(shiftedWeekStartMs - JAKARTA_OFFSET_MS);
}

/** The Jakarta calendar date (`YYYY-MM-DD`) a UTC instant falls on, matching what
 *  `to_char(date_trunc('week', ... AT TIME ZONE 'Asia/Jakarta'), 'YYYY-MM-DD')` produces in SQL
 *  for a row bucketed into the week starting at that instant (tasks.md - 2.3, 3.2). */
export function jakartaDateLabel(instant: Date): string {
  const shifted = new Date(instant.getTime() + JAKARTA_OFFSET_MS);
  const year = shifted.getUTCFullYear();
  const month = String(shifted.getUTCMonth() + 1).padStart(2, '0');
  const day = String(shifted.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** `col IS NULL OR btrim(col) = ''` — blank-aware missingness, not bare `IS NULL`
 *  (design.md - "Content debt" - the autosave path stores an intentionally cleared field as
 *  `''`, never coercing it to `NULL`). */
function blankOrNull(column: AnyPgColumn) {
  return or(isNull(column), sql`btrim(${column}) = ''`);
}

export interface AnalyticsPipelineCounts {
  draft: number;
  scheduled: number;
  published: number;
}

/** `weekStart` arrives already formatted (`YYYY-MM-DD`, Jakarta calendar) — it is a GROUP BY
 *  bucket label produced in SQL, not a raw column, so there is no more primitive shape for the
 *  mapper to derive it from (tasks.md - 2.3). */
export interface AnalyticsCadenceBucket {
  weekStart: string;
  count: number;
}

export interface AnalyticsContentDebt {
  missingSeoDescription: number;
  missingExcerpt: number;
  missingFeaturedImage: number;
  uncategorized: number;
}

export interface AnalyticsCurationIntegrityCounts {
  total: number;
  visible: number;
}

export interface AnalyticsCurationIntegrity {
  home: AnalyticsCurationIntegrityCounts;
}

export interface AnalyticsDueSoonArticle {
  id: string;
  title: string;
  slug: string;
  publishedAt: Date;
}

export interface AnalyticsUpNext {
  dueWithin48h: AnalyticsDueSoonArticle[];
  dueWithin48hTotal: number;
  overdueUnpromotedCount: number;
}

export interface AnalyticsReaderActivity {
  newLast7d: number;
  activeLast30d: number;
}

export interface AnalyticsTopArticle {
  id: string;
  title: string;
  slug: string;
  views: number;
}

export interface AnalyticsReadership {
  last7dViews: number;
  last7dUniqueViews: number;
  topArticles: AnalyticsTopArticle[];
}

/** Drizzle queries only — no Express or contract types here, mirroring `article.repository.ts`. */
export interface AnalyticsRepository {
  getPipelineCounts(): Promise<AnalyticsPipelineCounts>;
  getCadence(now: Date): Promise<AnalyticsCadenceBucket[]>;
  getContentDebt(): Promise<AnalyticsContentDebt>;
  getCurationIntegrity(now: Date): Promise<AnalyticsCurationIntegrity>;
  getUpNext(now: Date): Promise<AnalyticsUpNext>;
  getReaderActivity(now: Date): Promise<AnalyticsReaderActivity>;
  getReadership(now: Date): Promise<AnalyticsReadership>;
}

export function createAnalyticsRepository(db: Database): AnalyticsRepository {
  return {
    async getPipelineCounts() {
      const rows = await db.select({ status: articles.status, count: count() }).from(articles).groupBy(articles.status);
      const counts: AnalyticsPipelineCounts = { draft: 0, scheduled: 0, published: 0 };
      for (const row of rows) counts[row.status] = row.count;
      return counts;
    },

    async getCadence(now) {
      const currentWeekStart = jakartaWeekStart(now);
      // Oldest of the 8 buckets: the current week plus the 7 complete weeks before it
      // (spec.md - "Publishing cadence").
      const cutoff = new Date(currentWeekStart.getTime() - (DASHBOARD_CADENCE_WEEKS - 1) * WEEK_MS);
      // End of the newest bucket: the current Jakarta week hasn't finished, but nothing published
      // after it belongs in any of the 8 buckets, so the range is bounded on both sides.
      const nextWeekStart = new Date(currentWeekStart.getTime() + WEEK_MS);

      // Filtered on the bare `published_at` column, not a wrapped expression, so
      // `articles_status_published_at_idx` stays usable (design.md - "Risks / Trade-offs";
      // tasks.md - 2.3). The bucketing expression below is separate and only ever appears in
      // SELECT/GROUP BY, never in WHERE.
      const bucketExpr = sql<string>`to_char(date_trunc('week', ${articles.publishedAt} AT TIME ZONE 'Asia/Jakarta'), 'YYYY-MM-DD')`;

      const rows = await db
        .select({ weekStart: bucketExpr, count: count() })
        .from(articles)
        .where(and(eq(articles.status, 'published'), gte(articles.publishedAt, cutoff), lt(articles.publishedAt, nextWeekStart)))
        .groupBy(bucketExpr);

      const countByWeek = new Map(rows.map((row) => [row.weekStart, row.count]));
      const buckets: AnalyticsCadenceBucket[] = [];
      for (let i = 0; i < DASHBOARD_CADENCE_WEEKS; i++) {
        const label = jakartaDateLabel(new Date(cutoff.getTime() + i * WEEK_MS));
        buckets.push({ weekStart: label, count: countByWeek.get(label) ?? 0 });
      }
      return buckets;
    },

    async getContentDebt() {
      const uncategorizedCondition = notExists(
        db.select({ one: sql`1` }).from(articleCategories).where(eq(articleCategories.articleId, articles.id)),
      );

      const [articleRow] = await db
        .select({
          missingSeoDescription: sql<number>`count(*) filter (where ${blankOrNull(articles.seoDescription)})`.mapWith(Number),
          missingExcerpt: sql<number>`count(*) filter (where ${blankOrNull(articles.excerpt)})`.mapWith(Number),
          missingFeaturedImage: sql<number>`count(*) filter (where ${isNull(articles.featuredMediaId)})`.mapWith(Number),
          uncategorized: sql<number>`count(*) filter (where ${uncategorizedCondition})`.mapWith(Number),
        })
        .from(articles)
        .where(eq(articles.status, 'published'));

      return {
        missingSeoDescription: articleRow?.missingSeoDescription ?? 0,
        missingExcerpt: articleRow?.missingExcerpt ?? 0,
        missingFeaturedImage: articleRow?.missingFeaturedImage ?? 0,
        uncategorized: articleRow?.uncategorized ?? 0,
      };
    },

    async getCurationIntegrity(now) {
      const homeRows = await db
        .select({ status: articles.status, publishedAt: articles.publishedAt })
        .from(homeCuration)
        .innerJoin(articles, eq(articles.id, homeCuration.articleId));

      // Computed in application code from the imported predicate, never re-derived in SQL
      // (design.md - "Homepage integrity reuses the exact public-visibility predicate").
      const homeVisible = homeRows.filter((row) => isPubliclyVisible(row, now)).length;

      return {
        home: { total: homeRows.length, visible: homeVisible },
      };
    },

    async getUpNext(now) {
      const dueSoonRows = await db
        .select({
          id: articles.id,
          title: articles.title,
          slug: articles.slug,
          publishedAt: articles.publishedAt,
          // True total ahead of the LIMIT, in the same round trip (tasks.md - 2.8).
          total: sql<number>`count(*) over ()`.mapWith(Number),
        })
        .from(articles)
        .where(
          and(
            eq(articles.status, 'scheduled'),
            gte(articles.publishedAt, now),
            lte(articles.publishedAt, new Date(now.getTime() + DUE_SOON_WINDOW_MS)),
          ),
        )
        .orderBy(asc(articles.publishedAt))
        .limit(DASHBOARD_DUE_SOON_LIMIT);

      const [overdueRow] = await db
        .select({ count: count() })
        .from(articles)
        .where(and(eq(articles.status, 'scheduled'), lte(articles.publishedAt, new Date(now.getTime() - OVERDUE_GRACE_MS))));

      return {
        // `publishedAt` is never null on a `scheduled` row (design.md's lifecycle table), and the
        // WHERE clause above already filters to `scheduled` — the query cannot return a row with
        // a null `publishedAt` here, so narrowing the type is safe.
        dueWithin48h: dueSoonRows
          .filter((row): row is typeof row & { publishedAt: Date } => row.publishedAt !== null)
          .map((row) => ({ id: row.id, title: row.title, slug: row.slug, publishedAt: row.publishedAt })),
        dueWithin48hTotal: dueSoonRows[0]?.total ?? 0,
        overdueUnpromotedCount: overdueRow?.count ?? 0,
      };
    },

    async getReaderActivity(now) {
      const newCutoff = new Date(now.getTime() - NEW_READER_WINDOW_MS);
      const activeCutoff = new Date(now.getTime() - ACTIVE_READER_WINDOW_MS);

      const [row] = await db
        .select({
          // `activeLast30d` naturally excludes a reader with `lastLoginAt IS NULL`: SQL's
          // `NULL >= x` evaluates to NULL, which `filter (where ...)` treats as false
          // (spec.md - "Reader who never logged in is not counted as active").
          newLast7d: sql<number>`count(*) filter (where ${gte(readers.createdAt, newCutoff)})`.mapWith(Number),
          activeLast30d: sql<number>`count(*) filter (where ${gte(readers.lastLoginAt, activeCutoff)})`.mapWith(Number),
        })
        .from(readers);

      return { newLast7d: row?.newLast7d ?? 0, activeLast30d: row?.activeLast30d ?? 0 };
    },

    async getReadership(now) {
      // Both windows are inclusive of today, so "trailing 7 days" spans today and the six Jakarta
      // calendar dates before it. `jakartaDateLabel` is the same helper the cadence buckets use,
      // so the readership section and the rest of the board agree on where a day begins
      // (spec.md - "Readership shares the dashboard's instant and timezone").
      const sevenDayCutoff = jakartaDateLabel(new Date(now.getTime() - (READERSHIP_TOTALS_DAYS - 1) * DAY_MS));
      const thirtyDayCutoff = jakartaDateLabel(new Date(now.getTime() - (READERSHIP_TOP_DAYS - 1) * DAY_MS));

      const totalViews = sql<number>`coalesce(sum(${articleViewsDaily.views}), 0)`;

      const [totals, topArticles] = await Promise.all([
        db
          .select({
            last7dViews: totalViews.mapWith(Number),
            last7dUniqueViews: sql<number>`coalesce(sum(${articleViewsDaily.uniqueViews}), 0)`.mapWith(Number),
          })
          .from(articleViewsDaily)
          .where(gte(articleViewsDaily.date, sevenDayCutoff)),
        db
          .select({
            id: articles.id,
            title: articles.title,
            slug: articles.slug,
            views: totalViews.mapWith(Number),
          })
          .from(articleViewsDaily)
          // Inner join, so an article deleted between the view and this read simply drops out.
          // `article_views_daily` cascades on delete, so in practice its rows are gone too — the
          // join is what makes that true rather than assumed.
          .innerJoin(articles, eq(articles.id, articleViewsDaily.articleId))
          .where(gte(articleViewsDaily.date, thirtyDayCutoff))
          .groupBy(articles.id, articles.title, articles.slug)
          // `id` breaks ties so two articles on the same count don't swap places between requests.
          .orderBy(sql`sum(${articleViewsDaily.views}) desc`, asc(articles.id))
          .limit(DASHBOARD_TOP_ARTICLES_LIMIT),
      ]);

      return {
        last7dViews: totals[0]?.last7dViews ?? 0,
        last7dUniqueViews: totals[0]?.last7dUniqueViews ?? 0,
        topArticles,
      };
    },
  };
}
