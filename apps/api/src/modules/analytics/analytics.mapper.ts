import type { DashboardResponse } from '@siders/contracts';
import type {
  AnalyticsCadenceBucket,
  AnalyticsContentDebt,
  AnalyticsCurationIntegrity,
  AnalyticsPipelineCounts,
  AnalyticsReaderActivity,
  AnalyticsUpNext,
} from './analytics.repository.js';

export interface DashboardData {
  pipeline: AnalyticsPipelineCounts;
  cadence: AnalyticsCadenceBucket[];
  contentDebt: AnalyticsContentDebt;
  curationIntegrity: AnalyticsCurationIntegrity;
  upNext: AnalyticsUpNext;
  readers: AnalyticsReaderActivity;
}

/** The only formatting step between the repository's raw rows and the contract shape: each
 *  due-soon article's `publishedAt` becomes an ISO string (tasks.md - 3.2). Every other section
 *  is already contract-shaped by the time it leaves the repository. */
export function toDashboardResponse(data: DashboardData): DashboardResponse {
  return {
    pipeline: data.pipeline,
    cadence: data.cadence,
    contentDebt: data.contentDebt,
    curationIntegrity: data.curationIntegrity,
    upNext: {
      dueWithin48h: data.upNext.dueWithin48h.map((article) => ({
        id: article.id,
        title: article.title,
        slug: article.slug,
        publishedAt: article.publishedAt.toISOString(),
      })),
      dueWithin48hTotal: data.upNext.dueWithin48hTotal,
      overdueUnpromotedCount: data.upNext.overdueUnpromotedCount,
    },
    readers: data.readers,
  };
}
