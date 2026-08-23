import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
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

describe('RelatedArticles', () => {
  it('renders nothing when the article has no category', async () => {
    const result = await RelatedArticles({ categorySlug: undefined, excludeId: 'current' });
    expect(result).toBeNull();
    expect(getArticlesMock).not.toHaveBeenCalled();
  });

  it('renders nothing when the category has no other articles', async () => {
    getArticlesMock.mockResolvedValueOnce([]);
    const result = await RelatedArticles({ categorySlug: 'kuliner', excludeId: 'current' });
    expect(result).toBeNull();
  });

  it('renders the related list and excludes the current article via the API call', async () => {
    getArticlesMock.mockResolvedValueOnce([makeArticle()]);
    const result = await RelatedArticles({ categorySlug: 'kuliner', excludeId: 'current-id' });

    render(result);
    expect(screen.getByText('A related story')).toBeInTheDocument();
    expect(getArticlesMock).toHaveBeenCalledWith(
      { categorySlugs: ['kuliner'], excludeIds: ['current-id'], limit: 5 },
      expect.anything(),
    );
  });
});
