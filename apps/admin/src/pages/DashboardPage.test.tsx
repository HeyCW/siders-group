import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import type { DashboardResponse } from '@siders/contracts';
import { DashboardPage } from './DashboardPage.js';
import { dashboardApi } from '../lib/dashboardApi.js';
import { ApiError } from '../lib/api.js';

vi.mock('../lib/dashboardApi.js', () => ({
  dashboardApi: { get: vi.fn() },
}));

afterEach(() => cleanup());

function dashboard(overrides: Partial<DashboardResponse> = {}): DashboardResponse {
  return {
    pipeline: { draft: 2, scheduled: 1, published: 10 },
    cadence: Array.from({ length: 8 }, (_, i) => ({ weekStart: `2026-0${(i % 9) + 1}-01`, count: 0 })),
    contentDebt: { missingSeoDescription: 0, missingExcerpt: 0, missingFeaturedImage: 0, uncategorized: 0 },
    curationIntegrity: { home: { total: 5, visible: 4 } },
    upNext: { dueWithin48h: [], dueWithin48hTotal: 0, overdueUnpromotedCount: 0 },
    readers: { newLast7d: 0, activeLast30d: 0 },
    readership: { last7dViews: 0, last7dUniqueViews: 0, topArticles: [] },
    ...overrides,
  };
}

describe('DashboardPage', () => {
  // specs/admin-dashboard/spec.md - seven read-only tiles computed from existing data.
  it('renders the pipeline counts once the dashboard loads', async () => {
    vi.mocked(dashboardApi.get).mockResolvedValue(dashboard({ pipeline: { draft: 3, scheduled: 2, published: 15 } }));

    render(<DashboardPage />);
    expect(screen.getByText('Loading…')).toBeTruthy();

    await waitFor(() => expect(screen.getByText('15')).toBeTruthy());
    expect(screen.getByText('3')).toBeTruthy();
    expect(screen.getByText('2')).toBeTruthy();
  });

  it('shows the permission-denied message on a 403, distinct from a generic load error', async () => {
    vi.mocked(dashboardApi.get).mockRejectedValue(new ApiError('Forbidden', 403));

    render(<DashboardPage />);

    await screen.findByText("You don't have permission to view the dashboard.");
  });

  it('shows a generic error message on any other failure', async () => {
    vi.mocked(dashboardApi.get).mockRejectedValue(new ApiError('Server exploded', 500));

    render(<DashboardPage />);

    await screen.findByText('Server exploded');
  });

  it('shows the no-history message for the cadence chart when every bucket is zero', async () => {
    vi.mocked(dashboardApi.get).mockResolvedValue(dashboard());

    render(<DashboardPage />);

    await screen.findByText('No articles published in this window yet.');
  });

  it('renders "up next" scheduled articles and the overdue-worker warning', async () => {
    vi.mocked(dashboardApi.get).mockResolvedValue(
      dashboard({
        upNext: {
          dueWithin48h: [{ id: 'a', title: 'Breaking News', slug: 'breaking-news', publishedAt: '2026-01-02T00:00:00.000Z' }],
          dueWithin48hTotal: 3,
          overdueUnpromotedCount: 1,
        },
      }),
    );

    render(<DashboardPage />);

    await screen.findByText('Breaking News');
    expect(screen.getByText(/past due — check the publish worker/)).toBeTruthy();
    expect(screen.getByText('…and 2 more')).toBeTruthy();
  });

  it('shows "no reader sign-in activity" and "no article reads" when both windows are empty', async () => {
    vi.mocked(dashboardApi.get).mockResolvedValue(dashboard());

    render(<DashboardPage />);

    await screen.findByText('No reader sign-in activity yet.');
    expect(screen.getByText('No article reads recorded yet.')).toBeTruthy();
  });

  it('renders readership stats and the top-articles list when there is history', async () => {
    vi.mocked(dashboardApi.get).mockResolvedValue(
      dashboard({
        readership: {
          last7dViews: 120,
          last7dUniqueViews: 80,
          topArticles: [{ id: 'a', title: 'Popular Piece', slug: 'popular-piece', views: 500 }],
        },
      }),
    );

    render(<DashboardPage />);

    await screen.findByText('Popular Piece');
    expect(screen.getByText('120')).toBeTruthy();
    expect(screen.getByText('80')).toBeTruthy();
  });
});
