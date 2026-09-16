import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { ArticleAdminResponse } from '@siders/contracts';
import { NewArticlePage } from './NewArticlePage.js';
import { articlesApi } from '../lib/articlesApi.js';

vi.mock('../lib/articlesApi.js', () => ({
  articlesApi: {
    create: vi.fn(),
  },
}));

afterEach(() => {
  cleanup();
  vi.mocked(articlesApi.create).mockClear();
});

function article(overrides: Partial<ArticleAdminResponse> & Pick<ArticleAdminResponse, 'id'>): ArticleAdminResponse {
  return {
    title: 'Untitled',
    slug: 'untitled-abcdef12',
    bodyJson: null,
    bodyHtml: '',
    excerpt: null,
    status: 'draft',
    authorId: 'author-1',
    authorName: 'Caller',
    featuredMediaId: null,
    featuredImageUrl: null,
    categories: [],
    anakUsaha: null,
    seoTitle: null,
    seoDescription: null,
    publishedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/articles/new" element={<NewArticlePage />} />
        <Route path="/articles/:id" element={<div>Article Edit Screen</div>} />
        <Route path="/articles" element={<div>Article List Screen</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('NewArticlePage', () => {
  // specs/article-management/spec.md - "New article starts as draft".
  it('creates a draft with a random-suffixed slug and navigates into its edit view', async () => {
    vi.mocked(articlesApi.create).mockResolvedValue(article({ id: 'new-1' }));

    renderAt('/articles/new');
    expect(screen.getByText('Creating draft…')).toBeTruthy();

    await waitFor(() => expect(screen.getByText('Article Edit Screen')).toBeTruthy());

    expect(articlesApi.create).toHaveBeenCalledTimes(1);
    const [request] = vi.mocked(articlesApi.create).mock.calls[0]!;
    expect(request.title).toBe('Untitled');
    expect(request.slug).toMatch(/^untitled-[0-9a-f]{8}$/);
  });

  it('creates only one draft even if the effect were to run again', async () => {
    vi.mocked(articlesApi.create).mockResolvedValue(article({ id: 'new-1' }));

    renderAt('/articles/new');
    await waitFor(() => expect(screen.getByText('Article Edit Screen')).toBeTruthy());

    expect(articlesApi.create).toHaveBeenCalledTimes(1);
  });

  it('shows the failure and offers a way back to the article list when creation fails', async () => {
    vi.mocked(articlesApi.create).mockRejectedValue(new Error('network error'));

    renderAt('/articles/new');
    await screen.findByText('Could not create a new article');

    await act(async () => {
      screen.getByRole('button', { name: 'Back to articles' }).click();
    });

    await waitFor(() => expect(screen.getByText('Article List Screen')).toBeTruthy());
  });
});
