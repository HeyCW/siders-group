import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { ArticlePublicCard } from '@siders/contracts';
import { RelatedArticles } from './RelatedArticles.js';

const getArticlesMock = vi.fn();
vi.mock('../../lib/api.js', () => ({
  getArticles: (...args: unknown[]) => getArticlesMock(...args),
}));

afterEach(() => {
  cleanup();
  getArticlesMock.mockReset();
});

function makeArticle(overrides: Partial<ArticlePublicCard> = {}): ArticlePublicCard {
  return {
    id: 'related-1',
    slug: 'related-story',
    title: 'A related story',
    excerpt: null,
    featuredImageUrl: null,
    categories: [{ id: 'c1', name: 'Kuliner', slug: 'kuliner' }],
    anakUsaha: null,
    authorName: 'Rina',
    publishedAt: '2026-08-01T00:00:00.000Z',
    ...overrides,
  };
}

function renderRelated(categorySlug: string | undefined, excludeId = 'current-id') {
  return render(
    <MemoryRouter>
      <RelatedArticles categorySlug={categorySlug} excludeId={excludeId} />
    </MemoryRouter>,
  );
}

describe('RelatedArticles', () => {
  it('renders nothing when the article has no category', () => {
    renderRelated(undefined);
    expect(getArticlesMock).not.toHaveBeenCalled();
  });

  it('renders nothing when the category has no other articles', async () => {
    getArticlesMock.mockResolvedValueOnce([]);
    renderRelated('kuliner');
    await waitFor(() => expect(getArticlesMock).toHaveBeenCalled());
    expect(screen.queryByText('Related')).not.toBeInTheDocument();
  });

  it('renders the related list and excludes the current article via the API call', async () => {
    getArticlesMock.mockResolvedValueOnce([makeArticle()]);
    renderRelated('kuliner', 'current-id');

    expect(await screen.findByText('A related story')).toBeInTheDocument();
    expect(getArticlesMock).toHaveBeenCalledWith({
      categorySlugs: ['kuliner'],
      excludeIds: ['current-id'],
      limit: 5,
    });
  });
});
