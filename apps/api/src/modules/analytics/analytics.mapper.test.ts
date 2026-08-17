import { describe, expect, it } from 'vitest';
import { toDashboardResponse, type DashboardData } from './analytics.mapper.js';

function fixture(): DashboardData {
  return {
    pipeline: { draft: 1, scheduled: 2, published: 30 },
    cadence: [{ weekStart: '2026-08-10', count: 5 }],
    contentDebt: { missingSeoDescription: 1, missingExcerpt: 2, missingFeaturedImage: 0, uncategorized: 3, unusedTags: 4 },
    curationIntegrity: { home: { total: 5, visible: 4 }, reels: { total: 3, visible: 3 } },
    upNext: {
      dueWithin48h: [
        { id: '11111111-1111-1111-1111-111111111111', title: 'Election results', slug: 'election-results', publishedAt: new Date('2026-08-14T10:30:00.000Z') },
      ],
      dueWithin48hTotal: 1,
      overdueUnpromotedCount: 0,
    },
    readers: { newLast7d: 6, activeLast30d: 90 },
    readership: {
      last7dViews: 1200,
      last7dUniqueViews: 800,
      topArticles: [
        { id: '22222222-2222-2222-2222-222222222222', title: 'Most read', slug: 'most-read', views: 640 },
      ],
    },
  };
}

describe('toDashboardResponse', () => {
  it('formats each due-soon article publishedAt as an ISO string', () => {
    const result = toDashboardResponse(fixture());
    expect(result.upNext.dueWithin48h[0]?.publishedAt).toBe('2026-08-14T10:30:00.000Z');
  });

  it('passes every other section through unchanged', () => {
    const data = fixture();
    const result = toDashboardResponse(data);
    expect(result.pipeline).toEqual(data.pipeline);
    expect(result.cadence).toEqual(data.cadence);
    expect(result.contentDebt).toEqual(data.contentDebt);
    expect(result.curationIntegrity).toEqual(data.curationIntegrity);
    expect(result.readers).toEqual(data.readers);
    expect(result.readership).toEqual(data.readership);
    expect(result.upNext.dueWithin48hTotal).toBe(data.upNext.dueWithin48hTotal);
    expect(result.upNext.overdueUnpromotedCount).toBe(data.upNext.overdueUnpromotedCount);
  });

  it('carries an empty due-soon list through as an empty array', () => {
    const data = fixture();
    data.upNext.dueWithin48h = [];
    data.upNext.dueWithin48hTotal = 0;
    const result = toDashboardResponse(data);
    expect(result.upNext.dueWithin48h).toEqual([]);
  });
});
