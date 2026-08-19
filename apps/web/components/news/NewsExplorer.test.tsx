import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ArticlePublicCard, CategoryResponse } from '@siders/contracts';
import { NewsExplorer } from './NewsExplorer.js';

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}));

const getArticlesMock = vi.fn();
vi.mock('../../lib/api.js', () => ({
  getArticles: (...args: unknown[]) => getArticlesMock(...args),
}));

afterEach(() => {
  cleanup();
  push.mockClear();
  getArticlesMock.mockReset();
});

function makeArticle(overrides: Partial<ArticlePublicCard> = {}): ArticlePublicCard {
  return {
    id: crypto.randomUUID(),
    slug: 'a-story',
    title: 'A story',
    excerpt: 'An excerpt about kafe di Surabaya',
    featuredImageUrl: null,
    categories: [],
    tags: [],
    authorName: 'Rina',
    publishedAt: '2026-08-01T00:00:00.000Z',
    ...overrides,
  };
}

const categories: CategoryResponse[] = [{ id: 'c1', name: 'Kuliner', slug: 'kuliner' }];

describe('NewsExplorer', () => {
  it('navigates to ?category=<slug> when a category is selected', () => {
    render(
      <NewsExplorer
        initialArticles={[makeArticle()]}
        categories={categories}
        activeCategorySlug={undefined}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /kategori/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Kuliner' }));
    expect(push).toHaveBeenCalledWith('/news?category=kuliner');
  });

  it('clears the category filter back to /news', () => {
    render(
      <NewsExplorer
        initialArticles={[makeArticle()]}
        categories={categories}
        activeCategorySlug="kuliner"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /kategori 1/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
    expect(push).toHaveBeenCalledWith('/news');
  });

  it('load-more appends fetched articles, and hides itself once a page returns fewer than a full page', async () => {
    // A full first page (NEWS_PAGE_SIZE = 9) is required for the button to render at all.
    const firstPage = Array.from({ length: 9 }, (_, i) => makeArticle({ title: `Article ${i}` }));
    const nextPage = [makeArticle({ title: 'Extra article' })]; // fewer than NEWS_PAGE_SIZE -> no more after
    getArticlesMock.mockResolvedValueOnce(nextPage);
    render(
      <NewsExplorer
        initialArticles={firstPage}
        categories={categories}
        activeCategorySlug={undefined}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /load more/i }));

    expect(await screen.findByText('Extra article')).toBeInTheDocument();
    expect(screen.getByText('Article 0')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /load more/i })).not.toBeInTheDocument();
  });

  it('search narrows the currently loaded set without calling the API', () => {
    const match = makeArticle({ title: 'Kerja remote di Surabaya' });
    const other = makeArticle({ title: 'Rute sepeda aman' });
    render(
      <NewsExplorer
        initialArticles={[match, other]}
        categories={categories}
        activeCategorySlug={undefined}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText('Search this page…'), {
      target: { value: 'remote' },
    });

    expect(screen.getByText('Kerja remote di Surabaya')).toBeInTheDocument();
    expect(screen.queryByText('Rute sepeda aman')).not.toBeInTheDocument();
    expect(getArticlesMock).not.toHaveBeenCalled();
  });
});
