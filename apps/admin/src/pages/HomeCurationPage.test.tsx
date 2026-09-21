import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ArticleAdminResponse, HomeCurationEntryResponse } from '@siders/contracts';
import { HomeCurationPage } from './HomeCurationPage.js';
import { curationApi } from '../lib/curationApi.js';
import { articlesApi } from '../lib/articlesApi.js';
import { ApiError } from '../lib/api.js';

vi.mock('../lib/curationApi.js', () => ({
  curationApi: { list: vi.fn(), replace: vi.fn() },
}));
vi.mock('../lib/articlesApi.js', () => ({
  articlesApi: { list: vi.fn() },
}));

afterEach(() => cleanup());

function article(overrides: Partial<ArticleAdminResponse> & Pick<ArticleAdminResponse, 'id'>): ArticleAdminResponse {
  return {
    title: 'Untitled',
    slug: 'untitled',
    bodyJson: null,
    bodyHtml: '',
    excerpt: null,
    status: 'published',
    authorId: 'author-1',
    authorName: 'Caller',
    featuredMediaId: null,
    featuredImageUrl: null,
    categories: [],
    anakUsaha: null,
    seoTitle: null,
    seoDescription: null,
    keywords: null,
    publishedAt: '2026-01-01T00:00:00.000Z',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    isHyperlocalSpotlight: false,
    ...overrides,
  };
}

function entry(a: ArticleAdminResponse, overrides: Partial<HomeCurationEntryResponse> = {}): HomeCurationEntryResponse {
  return {
    article: { id: a.id, title: a.title, slug: a.slug },
    status: a.status,
    position: 0,
    isPubliclyVisible: true,
    ...overrides,
  };
}

async function renderPage(picked: HomeCurationEntryResponse[] = [], candidates: ArticleAdminResponse[] = []) {
  vi.mocked(curationApi.list).mockResolvedValue(picked);
  vi.mocked(articlesApi.list).mockResolvedValue(candidates);
  render(<HomeCurationPage />);
  await waitFor(() => expect(curationApi.list).toHaveBeenCalled());
}

describe('HomeCurationPage — load', () => {
  it('lists picked articles and pickable candidates, excluding already-picked ones', async () => {
    const picked = article({ id: 'a', title: 'Picked Article' });
    const candidate = article({ id: 'b', title: 'Candidate Article' });
    await renderPage([entry(picked)], [picked, candidate]);

    await screen.findByText('Picked Article');
    expect(screen.getByText('Candidate Article')).toBeTruthy();
    // "Picked Article" appears once, in the curated list, not again among the candidates.
    expect(screen.getAllByText('Picked Article')).toHaveLength(1);
  });

  it('badges a picked entry that is not yet publicly visible', async () => {
    const scheduled = article({ id: 'a', title: 'Scheduled Piece', status: 'scheduled' });
    await renderPage([entry(scheduled, { isPubliclyVisible: false })], []);

    await screen.findByText('Not yet live');
  });

  it('shows the load error when either fetch fails', async () => {
    vi.mocked(curationApi.list).mockRejectedValue(new ApiError('boom', 500));
    vi.mocked(articlesApi.list).mockResolvedValue([]);

    render(<HomeCurationPage />);

    await screen.findByText('boom');
  });

  it('shows the empty-curation message with nothing picked', async () => {
    await renderPage([], []);

    await screen.findByText('Nothing curated. The homepage will show a purely chronological feed.');
  });
});

describe('HomeCurationPage — add/remove', () => {
  it('adds a candidate to the curated list', async () => {
    const candidate = article({ id: 'b', title: 'Candidate Article' });
    await renderPage([], [candidate]);
    await screen.findByText('Candidate Article');

    await act(async () => {
      screen.getByRole('button', { name: 'Add' }).click();
    });

    await waitFor(() => expect(screen.queryByText('No more articles to add.')).toBeTruthy());
    expect(screen.getAllByText('Candidate Article')).toHaveLength(1);
  });

  it('removes a picked article back out of the curated list', async () => {
    const picked = article({ id: 'a', title: 'Picked Article' });
    await renderPage([entry(picked)], [picked]);
    await screen.findByText('Picked Article');

    await act(async () => {
      screen.getByRole('button', { name: 'Remove' }).click();
    });

    await waitFor(() => expect(screen.getByText('Nothing curated. The homepage will show a purely chronological feed.')).toBeTruthy());
    // It reappears as a pickable candidate.
    expect(screen.getByText('Picked Article')).toBeTruthy();
  });

  it('disables further adds once the maximum of 10 is reached', async () => {
    const picked = Array.from({ length: 10 }, (_, i) => article({ id: `picked-${i}`, title: `Picked ${i}` }));
    const candidate = article({ id: 'extra', title: 'Extra Candidate' });
    await renderPage(
      picked.map((a) => entry(a)),
      [...picked, candidate],
    );

    await screen.findByText('Extra Candidate');
    expect((screen.getByRole('button', { name: 'Add' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('Maximum of 10 curated articles reached')).toBeTruthy();
  });

  it('clears the whole list only after confirming', async () => {
    const picked = article({ id: 'a', title: 'Picked Article' });
    await renderPage([entry(picked)], [picked]);
    await screen.findByText('Picked Article');

    vi.spyOn(window, 'confirm').mockReturnValue(false);
    await act(async () => {
      screen.getByRole('button', { name: 'Clear all' }).click();
    });
    expect(screen.getByText('Picked Article')).toBeTruthy();

    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await act(async () => {
      screen.getByRole('button', { name: 'Clear all' }).click();
    });
    await waitFor(() => expect(screen.getByText('Nothing curated. The homepage will show a purely chronological feed.')).toBeTruthy());
  });
});

describe('HomeCurationPage — save', () => {
  it('saves the current order and renders the server response', async () => {
    const picked = article({ id: 'a', title: 'Picked Article' });
    await renderPage([entry(picked)], [picked]);
    await screen.findByText('Picked Article');

    vi.mocked(curationApi.replace).mockResolvedValue([entry(article({ id: 'a', title: 'Renamed Article' }))]);
    await act(async () => {
      screen.getByRole('button', { name: 'Save order' }).click();
    });

    expect(curationApi.replace).toHaveBeenCalledWith(['a']);
    await waitFor(() => expect(screen.getByText('Renamed Article')).toBeTruthy());
  });

  it('shows a forbidden banner when saving is rejected as a 403', async () => {
    const picked = article({ id: 'a', title: 'Picked Article' });
    await renderPage([entry(picked)], [picked]);
    await screen.findByText('Picked Article');

    vi.mocked(curationApi.replace).mockRejectedValue(new ApiError('Forbidden', 403));
    await act(async () => {
      screen.getByRole('button', { name: 'Save order' }).click();
    });

    expect(screen.getByText("You don't have permission to manage homepage curation.")).toBeTruthy();
  });
});

describe('HomeCurationPage — reorder', () => {
  it('reorders the picked list on drag and drop', async () => {
    const a = article({ id: 'a', title: 'Alpha' });
    const b = article({ id: 'b', title: 'Beta' });
    await renderPage([entry(a, { position: 0 }), entry(b, { position: 1 })], [a, b]);
    await screen.findByText('Alpha');

    const rows = screen.getAllByRole('listitem').filter((li) => li.textContent?.includes('Alpha') || li.textContent?.includes('Beta'));
    await act(async () => {
      fireEvent.dragStart(rows[0]!);
    });
    await act(async () => {
      fireEvent.drop(rows[1]!);
    });

    vi.mocked(curationApi.replace).mockResolvedValue([entry(b, { position: 0 }), entry(a, { position: 1 })]);
    await act(async () => {
      screen.getByRole('button', { name: 'Save order' }).click();
    });

    expect(curationApi.replace).toHaveBeenCalledWith(['b', 'a']);
  });
});
