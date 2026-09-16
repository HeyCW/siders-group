import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReaderQueueRow } from '@siders/contracts';
import { ReaderModerationPage } from './ReaderModerationPage.js';
import { moderationApi } from '../lib/moderationApi.js';
import { ApiError } from '../lib/api.js';

vi.mock('../lib/moderationApi.js', () => ({
  moderationApi: {
    listComments: vi.fn(),
    moderateComment: vi.fn(),
    dismissCommentReports: vi.fn(),
    listReaders: vi.fn(),
    moderateReader: vi.fn(),
  },
}));

afterEach(() => cleanup());

function reader(overrides: Partial<ReaderQueueRow> & Pick<ReaderQueueRow, 'id'>): ReaderQueueRow {
  return {
    name: 'Alex Reader',
    email: 'alex@example.com',
    avatarUrl: null,
    status: 'active',
    mutedUntil: null,
    commentCount: 3,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

async function renderPage(initial: ReaderQueueRow[] = []) {
  vi.mocked(moderationApi.listReaders).mockResolvedValue(initial);
  render(<ReaderModerationPage />);
  await waitFor(() => expect(moderationApi.listReaders).toHaveBeenCalled());
}

describe('ReaderModerationPage — directory', () => {
  it('renders every reader with name, email, and comment count', async () => {
    await renderPage([reader({ id: 'a', name: 'Alex Reader', commentCount: 5 })]);

    expect(screen.getByText('Alex Reader')).toBeTruthy();
    expect(screen.getByText('alex@example.com')).toBeTruthy();
    expect(screen.getByText('5 comments')).toBeTruthy();
  });

  it('shows a muted badge only while the mute is still in the future', async () => {
    const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    await renderPage([reader({ id: 'a', mutedUntil: future })]);

    expect(screen.getByText(/Muted until/)).toBeTruthy();
  });

  it('does not show a muted badge once the mute has expired', async () => {
    const past = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    await renderPage([reader({ id: 'a', mutedUntil: past })]);

    expect(screen.queryByText(/Muted until/)).toBeNull();
  });

  it('submits a search and requests it from the server', async () => {
    await renderPage([]);
    vi.mocked(moderationApi.listReaders).mockResolvedValue([]);

    fireEvent.change(screen.getByPlaceholderText('Search by name or email'), { target: { value: 'alex' } });
    await act(async () => {
      screen.getByRole('button', { name: 'Search' }).click();
    });

    expect(moderationApi.listReaders).toHaveBeenCalledWith({ search: 'alex', status: 'all', limit: 20, offset: 0 });
  });

  it('requests the selected status tab', async () => {
    await renderPage([]);
    vi.mocked(moderationApi.listReaders).mockResolvedValue([]);

    await act(async () => {
      screen.getByRole('button', { name: 'Banned' }).click();
    });

    expect(moderationApi.listReaders).toHaveBeenCalledWith({ search: undefined, status: 'banned', limit: 20, offset: 0 });
  });

  it('offers "Load more" only when a full page came back, and requests the next offset', async () => {
    const full = Array.from({ length: 20 }, (_, i) => reader({ id: `id-${i}`, name: `Reader ${i}` }));
    await renderPage(full);

    expect(screen.getByRole('button', { name: 'Load more' })).toBeTruthy();
    vi.mocked(moderationApi.listReaders).mockResolvedValue([reader({ id: 'id-20', name: 'Reader 20' })]);

    await act(async () => {
      screen.getByRole('button', { name: 'Load more' }).click();
    });

    expect(moderationApi.listReaders).toHaveBeenCalledWith({ search: undefined, status: 'all', limit: 20, offset: 20 });
    await waitFor(() => expect(screen.getByText('Reader 20')).toBeTruthy());
    expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull();
  });

  it('shows the load error when the fetch fails', async () => {
    vi.mocked(moderationApi.listReaders).mockRejectedValue(new ApiError('boom', 500));
    render(<ReaderModerationPage />);

    await screen.findByText('boom');
  });
});

describe('ReaderModerationPage — ban/unban', () => {
  it('bans an active reader with an optional reason', async () => {
    const active = reader({ id: 'a', status: 'active' });
    await renderPage([active]);

    fireEvent.change(screen.getByPlaceholderText('Reason (optional)'), { target: { value: 'Spamming' } });
    vi.mocked(moderationApi.moderateReader).mockResolvedValue({ ...active, status: 'banned' });
    await act(async () => {
      screen.getByRole('button', { name: 'Ban' }).click();
    });

    expect(moderationApi.moderateReader).toHaveBeenCalledWith('a', { status: 'banned', reason: 'Spamming' });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Unban' })).toBeTruthy());
  });

  it('unbans a banned reader', async () => {
    const banned = reader({ id: 'a', status: 'banned' });
    await renderPage([banned]);
    vi.mocked(moderationApi.moderateReader).mockResolvedValue({ ...banned, status: 'active' });

    await act(async () => {
      screen.getByRole('button', { name: 'Unban' }).click();
    });

    expect(moderationApi.moderateReader).toHaveBeenCalledWith('a', { status: 'active' });
  });

  it('shows a forbidden banner when moderation is rejected as a 403', async () => {
    await renderPage([reader({ id: 'a', status: 'active' })]);
    vi.mocked(moderationApi.moderateReader).mockRejectedValue(new ApiError('Forbidden', 403));

    await act(async () => {
      screen.getByRole('button', { name: 'Ban' }).click();
    });

    expect(screen.getByText("You don't have permission to moderate readers.")).toBeTruthy();
  });
});

describe('ReaderModerationPage — mute/unmute', () => {
  it('offers three preset mute durations for an unmuted reader', async () => {
    await renderPage([reader({ id: 'a', mutedUntil: null })]);

    expect(screen.getByRole('button', { name: 'Mute 24h' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Mute 7d' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Mute 30d' })).toBeTruthy();
  });

  it('mutes with a future mutedUntil derived from the chosen preset', async () => {
    const active = reader({ id: 'a', mutedUntil: null });
    await renderPage([active]);
    const future = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    vi.mocked(moderationApi.moderateReader).mockResolvedValue({ ...active, mutedUntil: future });

    await act(async () => {
      screen.getByRole('button', { name: 'Mute 24h' }).click();
    });

    expect(moderationApi.moderateReader).toHaveBeenCalledWith('a', { mutedUntil: expect.any(String) });
    const [, body] = vi.mocked(moderationApi.moderateReader).mock.calls.at(-1)!;
    expect(new Date(body.mutedUntil as string).getTime()).toBeGreaterThan(Date.now());
  });

  it('offers Unmute instead of the presets for a currently-muted reader, sending null', async () => {
    const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const muted = reader({ id: 'a', mutedUntil: future });
    await renderPage([muted]);

    expect(screen.queryByRole('button', { name: 'Mute 24h' })).toBeNull();
    vi.mocked(moderationApi.moderateReader).mockResolvedValue({ ...muted, mutedUntil: null });

    await act(async () => {
      screen.getByRole('button', { name: 'Unmute' }).click();
    });

    expect(moderationApi.moderateReader).toHaveBeenCalledWith('a', { mutedUntil: null });
  });
});
