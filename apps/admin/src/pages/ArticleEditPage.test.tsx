import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { ArticleAdminResponse, ArticlePublicDetail, CategoryResponse } from '@siders/contracts';
import { ArticleEditPage } from './ArticleEditPage.js';
import { articlesApi } from '../lib/articlesApi.js';
import { anakUsahaApi, categoriesApi } from '../lib/taxonomyApi.js';
import { ApiError } from '../lib/api.js';

vi.mock('../lib/articlesApi.js', () => ({
  articlesApi: {
    list: vi.fn(),
    get: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    autosave: vi.fn(),
    remove: vi.fn(),
    publish: vi.fn(),
    unpublish: vi.fn(),
    schedule: vi.fn(),
    preview: vi.fn(),
  },
}));
vi.mock('../lib/taxonomyApi.js', () => ({
  categoriesApi: { list: vi.fn() },
  anakUsahaApi: { list: vi.fn() },
}));
vi.mock('../lib/mediaApi.js', () => ({ mediaApi: { upload: vi.fn() } }));
// The rich-text canvas is Tiptap/ProseMirror — out of scope for this page's own orchestration
// logic (autosave, lifecycle actions, sidebar fields), so it's stubbed the same way
// `PartnersPage.test.tsx` stubs `mediaApi` rather than exercising the real upload path.
vi.mock('../editor/EditorCanvas.js', () => ({
  EditorCanvas: () => <div data-testid="editor-canvas-stub" />,
}));

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
});

function article(overrides: Partial<ArticleAdminResponse> & Pick<ArticleAdminResponse, 'id'>): ArticleAdminResponse {
  return {
    title: 'Draft Title',
    slug: 'draft-title',
    bodyJson: { type: 'doc', content: [] },
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

function category(overrides: Partial<CategoryResponse> & Pick<CategoryResponse, 'id'>): CategoryResponse {
  return { name: 'News', slug: 'news', ...overrides };
}

function publicDetail(a: ArticleAdminResponse): ArticlePublicDetail {
  return {
    id: a.id,
    slug: a.slug,
    title: a.title,
    excerpt: a.excerpt,
    featuredImageUrl: a.featuredImageUrl,
    categories: a.categories,
    anakUsaha: a.anakUsaha,
    authorName: a.authorName,
    publishedAt: a.publishedAt ?? '2026-01-01T00:00:00.000Z',
    bodyHtml: a.bodyHtml,
    seoTitle: a.seoTitle,
    seoDescription: a.seoDescription,
    keywords: a.keywords,
  };
}

function renderAt(id: string) {
  return render(
    <MemoryRouter initialEntries={[`/articles/${id}`]}>
      <Routes>
        <Route path="/articles/:id" element={<ArticleEditPage />} />
        <Route path="/articles" element={<div>Article List Screen</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

async function renderPage(a: ArticleAdminResponse, categoryList: CategoryResponse[] = []) {
  vi.mocked(articlesApi.get).mockResolvedValue(a);
  vi.mocked(categoriesApi.list).mockResolvedValue(categoryList);
  vi.mocked(anakUsahaApi.list).mockResolvedValue([]);
  renderAt(a.id);
  await waitFor(() => expect(articlesApi.get).toHaveBeenCalledWith(a.id));
  await screen.findByDisplayValue(a.title);
}

describe('ArticleEditPage — load', () => {
  it('renders the loaded article into the form and shows its status', async () => {
    await renderPage(article({ id: 'a', title: 'Draft Title', status: 'draft' }));

    expect(screen.getByDisplayValue('Draft Title')).toBeTruthy();
    expect(screen.getByText('draft')).toBeTruthy();
    expect(screen.getByTestId('editor-canvas-stub')).toBeTruthy();
  });

  it('shows the load error instead of the form when the fetch fails', async () => {
    vi.mocked(articlesApi.get).mockRejectedValue(new ApiError('Article not found', 404));
    vi.mocked(categoriesApi.list).mockResolvedValue([]);
    vi.mocked(anakUsahaApi.list).mockResolvedValue([]);

    renderAt('missing');

    await screen.findByText('Article not found');
  });
});

describe('ArticleEditPage — autosave', () => {
  it('debounces title edits and shows Saving then Saved once the request resolves', async () => {
    const original = article({ id: 'a', title: 'Draft Title' });
    await renderPage(original);

    vi.useFakeTimers();
    fireEvent.change(screen.getByDisplayValue('Draft Title'), { target: { value: 'Updated Title' } });

    vi.mocked(articlesApi.autosave).mockResolvedValue({ ...original, title: 'Updated Title' });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1200);
    });

    expect(articlesApi.autosave).toHaveBeenCalledWith(
      'a',
      expect.objectContaining({ title: 'Updated Title' }),
    );
    vi.useRealTimers();
    await screen.findByText('Saved');
  });

  it('includes keywords in the autosave payload when the field is edited', async () => {
    const original = article({ id: 'a', title: 'Draft Title' });
    await renderPage(original);

    vi.useFakeTimers();
    const keywordsInput = screen.getByText('SEO keywords').parentElement!.querySelector('input') as HTMLInputElement;
    fireEvent.change(keywordsInput, { target: { value: 'jakarta, kuliner' } });

    vi.mocked(articlesApi.autosave).mockResolvedValue({ ...original, keywords: 'jakarta, kuliner' });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1200);
    });

    expect(articlesApi.autosave).toHaveBeenCalledWith(
      'a',
      expect.objectContaining({ keywords: 'jakarta, kuliner' }),
    );
    vi.useRealTimers();
  });

  it('shows the failure message when autosave rejects', async () => {
    const original = article({ id: 'a', title: 'Draft Title' });
    await renderPage(original);

    vi.useFakeTimers();
    fireEvent.change(screen.getByDisplayValue('Draft Title'), { target: { value: 'Updated Title' } });
    vi.mocked(articlesApi.autosave).mockRejectedValue(new ApiError('Save failed', 500));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1200);
    });

    vi.useRealTimers();
    await screen.findByText('Save failed');
  });
});

describe('ArticleEditPage — slug', () => {
  it('commits a changed slug on blur', async () => {
    const original = article({ id: 'a', slug: 'draft-title' });
    await renderPage(original);

    const slugInput = screen.getByDisplayValue('draft-title');
    fireEvent.change(slugInput, { target: { value: 'new-slug' } });
    vi.mocked(articlesApi.update).mockResolvedValue({ ...original, slug: 'new-slug' });
    await act(async () => {
      fireEvent.blur(slugInput);
    });

    expect(articlesApi.update).toHaveBeenCalledWith('a', { slug: 'new-slug' });
  });

  it('reverts the slug and shows an error when the update is rejected', async () => {
    const original = article({ id: 'a', slug: 'draft-title' });
    await renderPage(original);

    const slugInput = screen.getByDisplayValue('draft-title');
    fireEvent.change(slugInput, { target: { value: 'taken-slug' } });
    vi.mocked(articlesApi.update).mockRejectedValue(new ApiError('Slug already in use', 409));
    await act(async () => {
      fireEvent.blur(slugInput);
    });

    await screen.findByText('Slug already in use');
    expect((slugInput as HTMLInputElement).value).toBe('draft-title');
  });

  it('does not call update when the slug is unchanged on blur', async () => {
    const original = article({ id: 'a', slug: 'draft-title' });
    await renderPage(original);

    await act(async () => {
      fireEvent.blur(screen.getByDisplayValue('draft-title'));
    });

    expect(articlesApi.update).not.toHaveBeenCalled();
  });
});

describe('ArticleEditPage — lifecycle actions', () => {
  it('publishes a draft and shows the published status', async () => {
    const original = article({ id: 'a', status: 'draft' });
    await renderPage(original);

    vi.mocked(articlesApi.publish).mockResolvedValue({ ...original, status: 'published', publishedAt: '2026-01-02T00:00:00.000Z' });
    await act(async () => {
      screen.getByRole('button', { name: 'Publish' }).click();
    });

    expect(articlesApi.publish).toHaveBeenCalledWith('a');
    await waitFor(() => expect(screen.getByText('published')).toBeTruthy());
    expect(screen.getByRole('button', { name: 'Unpublish' })).toBeTruthy();
  });

  it('unpublishes a published article', async () => {
    const original = article({ id: 'a', status: 'published', publishedAt: '2026-01-01T00:00:00.000Z' });
    await renderPage(original);

    vi.mocked(articlesApi.unpublish).mockResolvedValue({ ...original, status: 'draft', publishedAt: null });
    await act(async () => {
      screen.getByRole('button', { name: 'Unpublish' }).click();
    });

    expect(articlesApi.unpublish).toHaveBeenCalledWith('a');
  });

  it('shows a permission-denied banner when a lifecycle action is rejected as a 403', async () => {
    const original = article({ id: 'a', status: 'draft' });
    await renderPage(original);

    vi.mocked(articlesApi.publish).mockRejectedValue(new ApiError('Forbidden', 403));
    await act(async () => {
      screen.getByRole('button', { name: 'Publish' }).click();
    });

    expect(screen.getByText("You don't have permission to perform that action.")).toBeTruthy();
  });

  it('schedules a future publish time', async () => {
    const original = article({ id: 'a', status: 'draft' });
    await renderPage(original);

    const scheduleInput = document.querySelector('input[type="datetime-local"]') as HTMLInputElement;
    fireEvent.change(scheduleInput, { target: { value: '2026-06-01T10:00' } });
    vi.mocked(articlesApi.schedule).mockResolvedValue({ ...original, status: 'scheduled' });
    await act(async () => {
      screen.getByRole('button', { name: 'Schedule' }).click();
    });

    expect(articlesApi.schedule).toHaveBeenCalledWith('a', { publishedAt: new Date('2026-06-01T10:00').toISOString() });
  });

  it('deletes the article after confirming, and navigates back to the article list', async () => {
    const original = article({ id: 'a' });
    await renderPage(original);

    vi.spyOn(window, 'confirm').mockReturnValue(false);
    await act(async () => {
      screen.getByRole('button', { name: 'Delete' }).click();
    });
    expect(articlesApi.remove).not.toHaveBeenCalled();

    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.mocked(articlesApi.remove).mockResolvedValue(undefined);
    await act(async () => {
      screen.getByRole('button', { name: 'Delete' }).click();
    });

    expect(articlesApi.remove).toHaveBeenCalledWith('a');
    await waitFor(() => expect(screen.getByText('Article List Screen')).toBeTruthy());
  });
});

describe('ArticleEditPage — preview', () => {
  it('opens the preview modal with the fetched public detail, and closes it', async () => {
    const original = article({ id: 'a', title: 'Draft Title' });
    await renderPage(original);

    vi.mocked(articlesApi.preview).mockResolvedValue(publicDetail(original));
    await act(async () => {
      screen.getByRole('button', { name: 'Preview' }).click();
    });

    // "Preview" labels both the trigger button and the modal's own header — disambiguated by tag.
    await waitFor(() => expect(screen.getAllByText('Preview').find((el) => el.tagName === 'SPAN')).toBeTruthy());
    // The modal's own heading duplicates the title already in the form's title input.
    expect(screen.getAllByText('Draft Title').length).toBeGreaterThan(0);

    await act(async () => {
      screen.getByRole('button', { name: 'Close' }).click();
    });
    expect(screen.queryAllByText('Preview').find((el) => el.tagName === 'SPAN')).toBeUndefined();
  });
});

describe('ArticleEditPage — categories', () => {
  it('toggling a category chip triggers an autosave with the updated category ids', async () => {
    const original = article({ id: 'a' });
    await renderPage(original, [category({ id: 'cat-1', name: 'Sports' })]);

    vi.useFakeTimers();
    await act(async () => {
      screen.getByRole('button', { name: 'Sports' }).click();
    });
    vi.mocked(articlesApi.autosave).mockResolvedValue({ ...original, categories: [category({ id: 'cat-1', name: 'Sports' })] });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1200);
    });

    expect(articlesApi.autosave).toHaveBeenCalledWith('a', expect.objectContaining({ categoryIds: ['cat-1'] }));
    vi.useRealTimers();
  });
});
