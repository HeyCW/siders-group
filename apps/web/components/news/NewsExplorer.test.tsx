import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { AnakUsahaResponse, ArticlePublicCard, CategoryResponse } from '@siders/contracts';
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

const categories: CategoryResponse[] = [
  { id: 'c1', name: 'Kuliner', slug: 'kuliner' },
  { id: 'c2', name: 'Wisata', slug: 'wisata' },
];

const anakUsahaOptions: AnakUsahaResponse[] = [
  { id: 'a1', name: 'SidersVox', slug: 'sidersvox' },
  { id: 'a2', name: 'Surabaya Siders', slug: 'surabaya-siders' },
];

function renderExplorer(overrides: Partial<React.ComponentProps<typeof NewsExplorer>> = {}) {
  return render(
    <NewsExplorer
      initialArticles={[makeArticle()]}
      categories={categories}
      anakUsahaOptions={anakUsahaOptions}
      activeCategorySlugs={[]}
      activeAnakUsahaSlugs={[]}
      activeDateOption={undefined}
      activeDateFrom={undefined}
      activeDateTo={undefined}
      {...overrides}
    />,
  );
}

describe('NewsExplorer', () => {
  it('navigates to ?category=<slug> when a category is selected', () => {
    renderExplorer();
    fireEvent.click(screen.getByRole('button', { name: /kategori/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Kuliner' }));
    expect(push).toHaveBeenCalledWith('/news?category=kuliner');
  });

  it('selecting a second category adds it rather than replacing the first', () => {
    renderExplorer({ activeCategorySlugs: ['kuliner'] });
    fireEvent.click(screen.getByRole('button', { name: /kategori 1/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Wisata' }));
    expect(push).toHaveBeenCalledWith('/news?category=kuliner%2Cwisata');
  });

  it('deselecting one category leaves the other active', () => {
    renderExplorer({ activeCategorySlugs: ['kuliner', 'wisata'] });
    fireEvent.click(screen.getByRole('button', { name: /kategori 2/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Kuliner' }));
    expect(push).toHaveBeenCalledWith('/news?category=wisata');
  });

  it('clears the category filter via the panel Reset control', () => {
    renderExplorer({ activeCategorySlugs: ['kuliner'] });
    fireEvent.click(screen.getByRole('button', { name: /kategori 1/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
    expect(push).toHaveBeenCalledWith('/news');
  });

  it('selecting an anak usaha pushes ?anakUsaha=<slug> using the real catalog', () => {
    renderExplorer();
    fireEvent.click(screen.getByRole('button', { name: /anak usaha/i }));
    expect(screen.getByRole('button', { name: 'SidersVox' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'SidersVox' }));
    expect(push).toHaveBeenCalledWith('/news?anakUsaha=sidersvox');
  });

  it('selecting a second anak usaha adds it rather than replacing the first', () => {
    renderExplorer({ activeAnakUsahaSlugs: ['sidersvox'] });
    fireEvent.click(screen.getByRole('button', { name: /anak usaha 1/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Surabaya Siders' }));
    expect(push).toHaveBeenCalledWith('/news?anakUsaha=sidersvox%2Csurabaya-siders');
  });

  it('selecting a relative Tanggal option pushes ?date=<option>', () => {
    renderExplorer();
    fireEvent.click(screen.getByRole('button', { name: /tanggal/i }));
    fireEvent.click(screen.getByRole('button', { name: '7 hari terakhir' }));
    expect(push).toHaveBeenCalledWith('/news?date=7d');
  });

  it('selecting a second Tanggal option replaces the first', () => {
    renderExplorer({ activeDateOption: '7d' });
    fireEvent.click(screen.getByRole('button', { name: /tanggal 1/i }));
    fireEvent.click(screen.getByRole('button', { name: '30 hari terakhir' }));
    expect(push).toHaveBeenCalledWith('/news?date=30d');
  });

  it('selecting Rentang khusus reveals from/to inputs and applies both on submit', () => {
    renderExplorer();
    fireEvent.click(screen.getByRole('button', { name: /tanggal/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Rentang khusus' }));

    fireEvent.change(screen.getByLabelText('Dari'), { target: { value: '2026-07-01' } });
    fireEvent.change(screen.getByLabelText('Sampai'), { target: { value: '2026-07-31' } });
    fireEvent.click(screen.getByRole('button', { name: 'Terapkan' }));

    expect(push).toHaveBeenCalledWith('/news?date=custom&dateFrom=2026-07-01&dateTo=2026-07-31');
  });

  it('load-more appends fetched articles, and hides itself once a page returns fewer than a full page', async () => {
    // A full first page (NEWS_PAGE_SIZE = 9) is required for the button to render at all.
    const firstPage = Array.from({ length: 9 }, (_, i) => makeArticle({ title: `Article ${i}` }));
    const nextPage = [makeArticle({ title: 'Extra article' })]; // fewer than NEWS_PAGE_SIZE -> no more after
    getArticlesMock.mockResolvedValueOnce(nextPage);
    renderExplorer({ initialArticles: firstPage });

    fireEvent.click(screen.getByRole('button', { name: /load more/i }));

    expect(await screen.findByText('Extra article')).toBeInTheDocument();
    expect(screen.getByText('Article 0')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /load more/i })).not.toBeInTheDocument();
  });

  it('search narrows the currently loaded set without calling the API', () => {
    const match = makeArticle({ title: 'Kerja remote di Surabaya' });
    const other = makeArticle({ title: 'Rute sepeda aman' });
    renderExplorer({ initialArticles: [match, other] });

    fireEvent.change(screen.getByPlaceholderText('Search this page…'), {
      target: { value: 'remote' },
    });

    expect(screen.getByText('Kerja remote di Surabaya')).toBeInTheDocument();
    expect(screen.queryByText('Rute sepeda aman')).not.toBeInTheDocument();
    expect(getArticlesMock).not.toHaveBeenCalled();
  });

  it('"Hapus semua" clears category, anak usaha, and date filters at once', () => {
    renderExplorer({ activeCategorySlugs: ['kuliner'], activeAnakUsahaSlugs: ['sidersvox'], activeDateOption: '7d' });
    fireEvent.click(screen.getByRole('button', { name: 'Hapus semua' }));
    expect(push).toHaveBeenCalledWith('/news');
  });
});
