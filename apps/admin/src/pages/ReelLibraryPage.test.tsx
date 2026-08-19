import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReelResponse } from '@siders/contracts';
import { ReelLibraryPage } from './ReelLibraryPage.js';
import { reelsApi } from '../lib/reelsApi.js';
import { mediaApi } from '../lib/mediaApi.js';

vi.mock('../lib/reelsApi.js', () => ({
  reelsApi: {
    create: vi.fn(),
    list: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  },
}));
vi.mock('../lib/mediaApi.js', () => ({ mediaApi: { upload: vi.fn() } }));

afterEach(() => cleanup());

function reel(overrides: Partial<ReelResponse> & Pick<ReelResponse, 'id'>): ReelResponse {
  return {
    provider: 'instagram',
    externalId: 'AbC-123x',
    posterUrl: 'https://cdn.example.com/poster.webp',
    caption: null,
    status: 'draft',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

async function renderPage(initial: ReelResponse[] = []) {
  vi.mocked(reelsApi.list).mockResolvedValue(initial);
  render(<ReelLibraryPage />);
  await waitFor(() => expect(reelsApi.list).toHaveBeenCalled());
}

describe('ReelLibraryPage — new reel form', () => {
  /** proposal.md - a reel's poster is optional; a recognized URL alone is enough to create one. */
  it('keeps "Add reel" disabled until the URL is recognized, with no poster required', async () => {
    await renderPage();

    const addButton = screen.getByRole('button', { name: 'Add reel' }) as HTMLButtonElement;
    expect(addButton.disabled).toBe(true);

    fireEvent.change(screen.getByPlaceholderText('https://www.instagram.com/reel/...'), {
      target: { value: 'https://www.instagram.com/reel/AbC-123x/' },
    });

    expect(addButton.disabled).toBe(false);
  });

  it('creates a reel with no poster, sending null rather than requiring an upload', async () => {
    await renderPage();
    vi.mocked(reelsApi.create).mockResolvedValue(reel({ id: 'a', posterUrl: null }));

    fireEvent.change(screen.getByPlaceholderText('https://www.instagram.com/reel/...'), {
      target: { value: 'https://www.instagram.com/reel/AbC-123x/' },
    });
    const addButton = screen.getByRole('button', { name: 'Add reel' }) as HTMLButtonElement;
    await act(async () => {
      addButton.click();
    });

    expect(reelsApi.create).toHaveBeenCalledWith({
      url: 'https://www.instagram.com/reel/AbC-123x/',
      posterMediaId: null,
      caption: undefined,
    });
  });

  it('keeps "Add reel" disabled for an unrecognized URL', async () => {
    await renderPage();

    fireEvent.change(screen.getByPlaceholderText('https://www.instagram.com/reel/...'), {
      target: { value: 'https://example.com/not-a-reel' },
    });

    expect(screen.getByText(/doesn't match a recognized provider/)).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Add reel' }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('ReelLibraryPage — reel list', () => {
  it('shows "No poster" for a reel with no poster image', async () => {
    await renderPage([reel({ id: 'a', posterUrl: null })]);

    expect(screen.getByText('No poster')).toBeTruthy();
  });
});
