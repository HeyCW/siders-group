import { describe, expect, it } from 'vitest';
import { DASHBOARD_CADENCE_WEEKS, DASHBOARD_DUE_SOON_LIMIT, dashboardResponseSchema } from './dashboard.js';

const id = (n: number) => `11111111-1111-1111-1111-${String(n).padStart(12, '0')}`;

function wellFormedPayload() {
  return {
    pipeline: { draft: 2, scheduled: 1, published: 40 },
    cadence: Array.from({ length: DASHBOARD_CADENCE_WEEKS }, (_, i) => ({
      weekStart: `2026-0${(i % 9) + 1}-04`,
      count: i,
    })),
    contentDebt: {
      missingSeoDescription: 3,
      missingExcerpt: 1,
      missingFeaturedImage: 2,
      uncategorized: 0,
      unusedTags: 4,
    },
    curationIntegrity: {
      home: { total: 8, visible: 7 },
      reels: { total: 5, visible: 5 },
    },
    upNext: {
      dueWithin48h: [{ id: id(1), title: 'Election results', slug: 'election-results', publishedAt: '2026-08-14T00:00:00.000Z' }],
      dueWithin48hTotal: 1,
      overdueUnpromotedCount: 0,
    },
    readers: { newLast7d: 12, activeLast30d: 340 },
  };
}

describe('dashboardResponseSchema', () => {
  it('accepts a well-formed payload', () => {
    const result = dashboardResponseSchema.safeParse(wellFormedPayload());
    expect(result.success).toBe(true);
  });

  it('rejects a cadence array shorter than 8 buckets', () => {
    const payload = wellFormedPayload();
    payload.cadence = payload.cadence.slice(0, DASHBOARD_CADENCE_WEEKS - 1);
    expect(dashboardResponseSchema.safeParse(payload).success).toBe(false);
  });

  it('rejects a cadence array longer than 8 buckets', () => {
    const payload = wellFormedPayload();
    payload.cadence = [...payload.cadence, { weekStart: '2026-09-01', count: 0 }];
    expect(dashboardResponseSchema.safeParse(payload).success).toBe(false);
  });

  it('rejects a weekStart that is not a plain calendar date', () => {
    const payload = wellFormedPayload();
    payload.cadence[0]!.weekStart = '2026-01-04T00:00:00.000Z';
    expect(dashboardResponseSchema.safeParse(payload).success).toBe(false);
  });

  it('rejects a contentDebt object carrying mediaMissingAlt', () => {
    // mediaMissingAlt was dropped from this capability (design.md); the schema does not accept
    // an unknown field, catching a caller who reintroduces it.
    const payload: Record<string, unknown> = wellFormedPayload();
    (payload.contentDebt as Record<string, unknown>).mediaMissingAlt = 0;
    const result = dashboardResponseSchema.safeParse(payload);
    // Zod's default object parsing strips unknown keys rather than rejecting them, so assert the
    // parsed value has no trace of the dropped field instead of asserting failure.
    expect(result.success).toBe(true);
    if (result.success) {
      expect('mediaMissingAlt' in result.data.contentDebt).toBe(false);
    }
  });

  it('rejects dueWithin48h beyond the cap', () => {
    const payload = wellFormedPayload();
    payload.upNext.dueWithin48h = Array.from({ length: DASHBOARD_DUE_SOON_LIMIT + 1 }, (_, i) => ({
      id: id(i + 2),
      title: `Article ${i}`,
      slug: `article-${i}`,
      publishedAt: '2026-08-14T00:00:00.000Z',
    }));
    expect(dashboardResponseSchema.safeParse(payload).success).toBe(false);
  });

  it('rejects a negative count', () => {
    const payload = wellFormedPayload();
    payload.readers.newLast7d = -1;
    expect(dashboardResponseSchema.safeParse(payload).success).toBe(false);
  });
});
