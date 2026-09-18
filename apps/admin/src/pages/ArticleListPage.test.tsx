import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { ArticleAdminResponse } from '@siders/contracts';
import { ArticleListPage } from './ArticleListPage.js';
import { articlesApi } from '../lib/articlesApi.js';
import { ApiError } from '../lib/api.js';

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
    status: 'draft',
    authorId: 'author-1',
    authorName: 'Caller',
    featuredMediaId: null,
    featuredImageUrl: null,
    categories: [],
    anakUsaha: null,
    seoTitle: null,
    seoDescription: null,
    keywords: null,
    publishedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function renderAt(path = '/articles') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/articles" element={<ArticleListPage />} />
        <Route path="/articles/new" element={<div>New Article Screen</div>} />
        <Route path="/articles/:id" element={<div>Article Edit Screen</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

async function renderPage(initial: ArticleAdminResponse[] = []) {
  vi.mocked(articlesApi.list).mockResolvedValue(initial);
  renderAt();
  await waitFor(() => expect(articlesApi.list).toHaveBeenCalled());
}

describe('ArticleListPage — list', () => {
  it('renders every article with its status and byline', async () => {
    await renderPage([article({ id: 'a', title: 'Breaking News', authorName: 'Jane', status: 'published' })]);

    await screen.findByText('Breaking News');
    expect(screen.getByText('published')).toBeTruthy();
    expect(screen.getByText(/Jane/)).toBeTruthy();
  });

  it('shows "Untitled" for an article with a blank title', async () => {
    await renderPage([article({ id: 'a', title: '' })]);

    await screen.findByText('Untitled');
  });

  it('counts articles per status in the filter tabs', async () => {
    await renderPage([
      article({ id: 'a', status: 'draft' }),
      article({ id: 'b', status: 'published' }),
      article({ id: 'c', status: 'published' }),
    ]);

    await screen.findByText('3 in the queue');
    expect(screen.getByText('2', { selector: 'span' })).toBeTruthy();
  });

  it('shows the empty state with no articles at all', async () => {
    await renderPage([]);

    await screen.findByText('No articles yet. Write the first one.');
  });

  it('shows the load error when the fetch fails', async () => {
    vi.mocked(articlesApi.list).mockRejectedValue(new ApiError('boom', 500));
    renderAt();

    await screen.findByText('boom');
  });
});

describe('ArticleListPage — filtering', () => {
  it('filters the visible list by status tab', async () => {
    await renderPage([
      article({ id: 'a', title: 'Draft One', status: 'draft' }),
      article({ id: 'b', title: 'Published One', status: 'published' }),
    ]);
    await screen.findByText('Draft One');

    fireEvent.click(screen.getByRole('button', { name: /Draft/ }));

    expect(screen.getByText('Draft One')).toBeTruthy();
    expect(screen.queryByText('Published One')).toBeNull();
  });

  it('filters by search across title and byline', async () => {
    await renderPage([
      article({ id: 'a', title: 'Alpha Story', authorName: 'Jane' }),
      article({ id: 'b', title: 'Beta Story', authorName: 'John' }),
    ]);
    await screen.findByText('Alpha Story');

    fireEvent.change(screen.getByPlaceholderText('Search title or byline…'), { target: { value: 'jane' } });

    expect(screen.getByText('Alpha Story')).toBeTruthy();
    expect(screen.queryByText('Beta Story')).toBeNull();
  });

  it('shows "nothing matches" when a search excludes every article', async () => {
    await renderPage([article({ id: 'a', title: 'Alpha Story' })]);
    await screen.findByText('Alpha Story');

    fireEvent.change(screen.getByPlaceholderText('Search title or byline…'), { target: { value: 'zzz' } });

    await screen.findByText('Nothing matches that search.');
  });
});

describe('ArticleListPage — navigation', () => {
  it('links "New article" to the new-article route', async () => {
    await renderPage([]);
    await screen.findByText('No articles yet. Write the first one.');

    fireEvent.click(screen.getByRole('link', { name: 'New article' }));

    await waitFor(() => expect(screen.getByText('New Article Screen')).toBeTruthy());
  });

  it('links an article row to its edit route', async () => {
    await renderPage([article({ id: 'a', title: 'Breaking News' })]);
    await screen.findByText('Breaking News');

    fireEvent.click(screen.getByRole('link', { name: /Breaking News/ }));

    await waitFor(() => expect(screen.getByText('Article Edit Screen')).toBeTruthy());
  });
});
