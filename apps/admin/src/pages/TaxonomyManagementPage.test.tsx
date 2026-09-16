import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { TaxonomyManagementPage, type TaxonomyApi } from './TaxonomyManagementPage.js';
import { ApiError } from '../lib/api.js';

afterEach(() => cleanup());

interface TaxonomyItem {
  id: string;
  name: string;
  slug: string;
}

function item(overrides: Partial<TaxonomyItem> & Pick<TaxonomyItem, 'id'>): TaxonomyItem {
  return { name: 'News', slug: 'news', ...overrides };
}

function makeApi(overrides: Partial<TaxonomyApi> = {}): TaxonomyApi {
  return {
    list: vi.fn().mockResolvedValue([]),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    ...overrides,
  };
}

async function renderPage(api: TaxonomyApi, props: { title?: string; singularLabel?: string } = {}) {
  render(<TaxonomyManagementPage title={props.title ?? 'Categories'} singularLabel={props.singularLabel ?? 'category'} api={api} />);
  await waitFor(() => expect(api.list).toHaveBeenCalled());
}

// Both /categories and /anak-usaha are this one shared screen shape
// (specs/category-management/spec.md - "Permission-gated ... endpoints").
describe('TaxonomyManagementPage — list', () => {
  it('renders every item with its slug', async () => {
    const api = makeApi({ list: vi.fn().mockResolvedValue([item({ id: 'a', name: 'News', slug: 'news' })]) });
    await renderPage(api);

    expect(screen.getByText('News')).toBeTruthy();
    expect(screen.getByText('news')).toBeTruthy();
  });

  it('shows an empty state with no items', async () => {
    await renderPage(makeApi());

    expect(screen.getByText('No categories yet. Add the first one above.')).toBeTruthy();
  });

  it('shows the load error when the initial fetch fails', async () => {
    const api = makeApi({ list: vi.fn().mockRejectedValue(new ApiError('boom', 500)) });
    render(<TaxonomyManagementPage title="Categories" singularLabel="category" api={api} />);

    await screen.findByText('boom');
  });
});

describe('TaxonomyManagementPage — create', () => {
  it('keeps "Add" disabled until a name is typed, then creates and appends the item', async () => {
    const api = makeApi();
    await renderPage(api);

    const addButton = screen.getByRole('button', { name: 'Add' }) as HTMLButtonElement;
    expect(addButton.disabled).toBe(true);

    fireEvent.change(screen.getByLabelText('New category'), { target: { value: 'Sports' } });
    expect(addButton.disabled).toBe(false);

    vi.mocked(api.create).mockResolvedValue(item({ id: 'new-1', name: 'Sports', slug: 'sports' }));
    await act(async () => {
      addButton.click();
    });

    expect(api.create).toHaveBeenCalledWith('Sports');
    await waitFor(() => expect(screen.getByText('Sports')).toBeTruthy());
    // The input clears after a successful create.
    expect((screen.getByLabelText('New category') as HTMLInputElement).value).toBe('');
  });

  it('submits on Enter as well as the button', async () => {
    const api = makeApi();
    await renderPage(api);
    vi.mocked(api.create).mockResolvedValue(item({ id: 'new-1', name: 'Sports', slug: 'sports' }));

    const input = screen.getByLabelText('New category');
    fireEvent.change(input, { target: { value: 'Sports' } });
    await act(async () => {
      fireEvent.keyDown(input, { key: 'Enter' });
    });

    expect(api.create).toHaveBeenCalledWith('Sports');
  });

  it('shows a forbidden banner when create is rejected as a 403', async () => {
    const api = makeApi();
    await renderPage(api);
    vi.mocked(api.create).mockRejectedValue(new ApiError('Forbidden', 403));

    fireEvent.change(screen.getByLabelText('New category'), { target: { value: 'Sports' } });
    await act(async () => {
      screen.getByRole('button', { name: 'Add' }).click();
    });

    expect(screen.getByText("You don't have permission to manage categories.")).toBeTruthy();
  });
});

describe('TaxonomyManagementPage — rename', () => {
  it('renames an item and shows the server response', async () => {
    const api = makeApi({ list: vi.fn().mockResolvedValue([item({ id: 'a', name: 'News', slug: 'news' })]) });
    await renderPage(api);

    await act(async () => {
      screen.getByRole('button', { name: 'Rename' }).click();
    });

    const editInput = screen.getByDisplayValue('News');
    fireEvent.change(editInput, { target: { value: 'Breaking News' } });

    vi.mocked(api.update).mockResolvedValue(item({ id: 'a', name: 'Breaking News', slug: 'breaking-news' }));
    await act(async () => {
      screen.getByRole('button', { name: 'Save' }).click();
    });

    expect(api.update).toHaveBeenCalledWith('a', 'Breaking News');
    await waitFor(() => expect(screen.getByText('Breaking News')).toBeTruthy());
  });

  it('cancel leaves the item untouched', async () => {
    const api = makeApi({ list: vi.fn().mockResolvedValue([item({ id: 'a', name: 'News', slug: 'news' })]) });
    await renderPage(api);

    await act(async () => {
      screen.getByRole('button', { name: 'Rename' }).click();
    });
    fireEvent.change(screen.getByDisplayValue('News'), { target: { value: 'Something else' } });
    await act(async () => {
      screen.getByRole('button', { name: 'Cancel' }).click();
    });

    expect(screen.getByText('News')).toBeTruthy();
    expect(api.update).not.toHaveBeenCalled();
  });
});

describe('TaxonomyManagementPage — delete', () => {
  it('deletes only after the confirm dialog is accepted', async () => {
    const api = makeApi({ list: vi.fn().mockResolvedValue([item({ id: 'a', name: 'News', slug: 'news' })]) });
    await renderPage(api);
    vi.spyOn(window, 'confirm').mockReturnValue(false);

    await act(async () => {
      screen.getByRole('button', { name: 'Delete' }).click();
    });

    expect(api.remove).not.toHaveBeenCalled();
    expect(screen.getByText('News')).toBeTruthy();
  });

  it('removes the item from the list once confirmed', async () => {
    const api = makeApi({ list: vi.fn().mockResolvedValue([item({ id: 'a', name: 'News', slug: 'news' })]) });
    await renderPage(api);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.mocked(api.remove).mockResolvedValue(undefined);

    await act(async () => {
      screen.getByRole('button', { name: 'Delete' }).click();
    });

    expect(api.remove).toHaveBeenCalledWith('a');
    await waitFor(() => expect(screen.queryByText('News')).toBeNull());
  });
});
