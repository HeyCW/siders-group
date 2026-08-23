import { describe, expect, it } from 'vitest';
import { createAnalyticsService } from './analytics.service.js';
import type { AnalyticsRepository } from './analytics.repository.js';

function createFakeAnalyticsRepository(): { repository: AnalyticsRepository; calledWithNow: Date[] } {
  const calledWithNow: Date[] = [];
  const repository: AnalyticsRepository = {
    async getPipelineCounts() {
      return { draft: 1, scheduled: 2, published: 30 };
    },
    async getCadence(now) {
      calledWithNow.push(now);
      return [{ weekStart: '2026-08-10', count: 5 }];
    },
    async getContentDebt() {
      return { missingSeoDescription: 1, missingExcerpt: 0, missingFeaturedImage: 0, uncategorized: 0 };
    },
    async getCurationIntegrity(now) {
      calledWithNow.push(now);
      return { home: { total: 1, visible: 1 } };
    },
    async getUpNext(now) {
      calledWithNow.push(now);
      return {
        dueWithin48h: [{ id: '1', title: 'Title', slug: 'slug', publishedAt: new Date('2026-08-14T00:00:00.000Z') }],
        dueWithin48hTotal: 1,
        overdueUnpromotedCount: 0,
      };
    },
    async getReaderActivity(now) {
      calledWithNow.push(now);
      return { newLast7d: 2, activeLast30d: 20 };
    },
    async getReadership(now) {
      calledWithNow.push(now);
      return {
        last7dViews: 900,
        last7dUniqueViews: 640,
        topArticles: [{ id: '2', title: 'Most read', slug: 'most-read', views: 500 }],
      };
    },
  };
  return { repository, calledWithNow };
}

describe('AnalyticsService', () => {
  it('composes all seven repository calls into one DashboardResponse', async () => {
    const { repository } = createFakeAnalyticsRepository();
    const service = createAnalyticsService(repository);

    const result = await service.getDashboard();

    expect(result.pipeline).toEqual({ draft: 1, scheduled: 2, published: 30 });
    expect(result.cadence).toEqual([{ weekStart: '2026-08-10', count: 5 }]);
    expect(result.contentDebt.missingSeoDescription).toBe(1);
    expect(result.curationIntegrity.home).toEqual({ total: 1, visible: 1 });
    expect(result.upNext.dueWithin48h[0]?.publishedAt).toBe('2026-08-14T00:00:00.000Z');
    expect(result.readers).toEqual({ newLast7d: 2, activeLast30d: 20 });
    expect(result.readership.last7dViews).toBe(900);
    expect(result.readership.topArticles[0]?.slug).toBe('most-read');
  });

  it('shares one `now` across every repository call, not a separately captured instant per call', async () => {
    const { repository, calledWithNow } = createFakeAnalyticsRepository();
    const service = createAnalyticsService(repository);

    await service.getDashboard();

    expect(calledWithNow).toHaveLength(5);
    const [first, ...rest] = calledWithNow;
    expect(rest.every((instant) => instant.getTime() === first?.getTime())).toBe(true);
  });
});
