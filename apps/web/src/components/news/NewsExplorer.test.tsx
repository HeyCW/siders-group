import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { AnakUsahaResponse, ArticlePublicCard, CategoryResponse } from '@siders/contracts';
import { NewsExplorer } from './NewsExplorer.js';
import type * as ReactRouterDom from 'react-router-dom';

const navigate = vi.fn();
// NewsExplorer reads the URL itself via useSearchParams() rather than receiving it as a prop, so
// the mock supplies that hook too, backed by a module-level URLSearchParams the tests can set per
// case. Link/MemoryRouter are left real (via importOriginal) since ArticleCard renders a real
// react-router Link — that needs an actual <MemoryRouter> ancestor, provided by renderExplorer.
let currentParams = new URLSearchParams();
vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof ReactRouterDom>()),
  useNavigate: () => navigate,
  useSearchParams: () => [currentParams] as const,
}));

const getArticlesMock = vi.fn();
vi.mock('../../lib/api.js', () => ({
  getArticles: (...args: unknown[]) => getArticlesMock(...args),
}));

afterEach(() => {
  cleanup();
  navigate.mockClear();
  getArticlesMock.mockReset();
  currentParams = new URLSearchParams();
});

function makeArticle(overrides: Partial<ArticlePublicCard> = {}): ArticlePublicCard {
  return {
    id: crypto.randomUUID(),
    slug: 'a-story',
    title: 'A story',
    excerpt: 'An excerpt about kafe di Surabaya',
    featuredImageUrl: null,
    categories: [],
    anakUsaha: null,
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

/**
 * Renders NewsExplorer with the given URL search params, having queued `firstPage` as the
 * result of the mount-time fetch NewsExplorer now always makes (it no longer receives
 * `initialArticles` as a prop), then waits for that fetch to settle so callers aren't left with
 * a pending state update after the test body returns.
 */
async function renderExplorer(
  params: Record<string, string> = {},
  firstPage: ArticlePublicCard[] = [makeArticle()],
) {
  currentParams = new URLSearchParams(params);
  getArticlesMock.mockResolvedValueOnce(firstPage);
  const result = render(
    <MemoryRouter>
      <NewsExplorer categories={categories} anakUsahaOptions={anakUsahaOptions} />
    </MemoryRouter>,
  );
  await waitFor(() => expect(screen.queryByText('Loading…')).not.toBeInTheDocument());
  return result;
}

describe('NewsExplorer', () => {
  it('navigates to ?category=<slug> when a category is selected', async () => {
    await renderExplorer();
    fireEvent.click(screen.getByRole('button', { name: /category/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Kuliner' }));
    expect(navigate).toHaveBeenCalledWith('/news?category=kuliner');
  });

  it('selecting a second category adds it rather than replacing the first', async () => {
    await renderExplorer({ category: 'kuliner' });
    fireEvent.click(screen.getByRole('button', { name: /category 1/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Wisata' }));
    expect(navigate).toHaveBeenCalledWith('/news?category=kuliner%2Cwisata');
  });

  it('deselecting one category leaves the other active', async () => {
    await renderExplorer({ category: 'kuliner,wisata' });
    fireEvent.click(screen.getByRole('button', { name: /category 2/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Kuliner' }));
    expect(navigate).toHaveBeenCalledWith('/news?category=wisata');
  });

  it('clears the category filter via the panel Reset control', async () => {
    await renderExplorer({ category: 'kuliner' });
    fireEvent.click(screen.getByRole('button', { name: /category 1/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
    expect(navigate).toHaveBeenCalledWith('/news');
  });

  it('selecting an anak usaha pushes ?anakUsaha=<slug> using the real catalog', async () => {
    await renderExplorer();
    fireEvent.click(screen.getByRole('button', { name: /group companies/i }));
    expect(screen.getByRole('button', { name: 'SidersVox' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'SidersVox' }));
    expect(navigate).toHaveBeenCalledWith('/news?anakUsaha=sidersvox');
  });

  it('selecting a second anak usaha adds it rather than replacing the first', async () => {
    await renderExplorer({ anakUsaha: 'sidersvox' });
    fireEvent.click(screen.getByRole('button', { name: /group companies 1/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Surabaya Siders' }));
    expect(navigate).toHaveBeenCalledWith('/news?anakUsaha=sidersvox%2Csurabaya-siders');
  });

  it('selecting a relative Date option pushes ?date=<option>', async () => {
    await renderExplorer();
    fireEvent.click(screen.getByRole('button', { name: /date/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Last 7 days' }));
    expect(navigate).toHaveBeenCalledWith('/news?date=7d');
  });

  it('selecting a second Date option replaces the first', async () => {
    await renderExplorer({ date: '7d' });
    fireEvent.click(screen.getByRole('button', { name: /date 1/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Last 30 days' }));
    expect(navigate).toHaveBeenCalledWith('/news?date=30d');
  });

  it('selecting Custom range reveals from/to inputs and applies both on submit', async () => {
    await renderExplorer();
    fireEvent.click(screen.getByRole('button', { name: /date/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Custom range' }));

    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-07-01' } });
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '2026-07-31' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));

    expect(navigate).toHaveBeenCalledWith('/news?date=custom&dateFrom=2026-07-01&dateTo=2026-07-31');
  });

  it('toggling sort flips the label and re-fetches with the opposite order', async () => {
    await renderExplorer();
    expect(screen.getByRole('button', { name: /sort: newest/i })).toBeInTheDocument();

    getArticlesMock.mockResolvedValueOnce([makeArticle()]);
    fireEvent.click(screen.getByRole('button', { name: /sort: newest/i }));
    await waitFor(() => expect(getArticlesMock).toHaveBeenCalledTimes(2));
    expect(getArticlesMock).toHaveBeenLastCalledWith(expect.objectContaining({ order: 'oldest' }));
    expect(screen.getByRole('button', { name: /sort: oldest/i })).toBeInTheDocument();

    getArticlesMock.mockResolvedValueOnce([makeArticle()]);
    fireEvent.click(screen.getByRole('button', { name: /sort: oldest/i }));
    await waitFor(() => expect(getArticlesMock).toHaveBeenCalledTimes(3));
    expect(getArticlesMock).toHaveBeenLastCalledWith(expect.objectContaining({ order: 'newest' }));
  });

  it('load-more appends fetched articles, and hides itself once a page returns fewer than a full page', async () => {
    // A full first page (NEWS_PAGE_SIZE = 9) is required for the button to render at all.
    const firstPage = Array.from({ length: 9 }, (_, i) => makeArticle({ title: `Article ${i}` }));
    const nextPage = [makeArticle({ title: 'Extra article' })]; // fewer than NEWS_PAGE_SIZE -> no more after
    await renderExplorer({}, firstPage);
    getArticlesMock.mockResolvedValueOnce(nextPage);

    fireEvent.click(screen.getByRole('button', { name: /load more/i }));

    expect(await screen.findByText('Extra article')).toBeInTheDocument();
    expect(screen.getByText('Article 0')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /load more/i })).not.toBeInTheDocument();
  });

  it('search narrows the currently loaded set without calling the API again', async () => {
    const match = makeArticle({ title: 'Kerja remote di Surabaya' });
    const other = makeArticle({ title: 'Rute sepeda aman' });
    await renderExplorer({}, [match, other]);

    fireEvent.change(screen.getByPlaceholderText('Search this page…'), {
      target: { value: 'remote' },
    });

    expect(screen.getByText('Kerja remote di Surabaya')).toBeInTheDocument();
    expect(screen.queryByText('Rute sepeda aman')).not.toBeInTheDocument();
    expect(getArticlesMock).toHaveBeenCalledTimes(1);
  });

  it('"Hapus semua" clears category, anak usaha, and date filters at once', async () => {
    await renderExplorer({ category: 'kuliner', anakUsaha: 'sidersvox', date: '7d' });
    fireEvent.click(screen.getByRole('button', { name: 'Hapus semua' }));
    expect(navigate).toHaveBeenCalledWith('/news');
  });
});
