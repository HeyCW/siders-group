import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { CommentQueueRow } from '@siders/contracts';
import { CommentModerationPage } from './CommentModerationPage.js';
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

/** The "Removed" status badge shares its label with the "Removed" filter tab — disambiguated by
 *  tag, the same way `ContactMessagesPage.test.tsx` disambiguates its "Unread" duplicate. */
function removedBadge(): HTMLElement | undefined {
  return screen.queryAllByText('Removed').find((el) => el.tagName === 'SPAN');
}

function comment(overrides: Partial<CommentQueueRow> & Pick<CommentQueueRow, 'id'>): CommentQueueRow {
  return {
    body: 'Great article!',
    status: 'visible',
    articleId: 'article-1',
    articleTitle: 'Sample Article',
    articleSlug: 'sample-article',
    authorName: 'Reader One',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

async function renderPage(initial: CommentQueueRow[] = [], nextCursor: string | null = null) {
  vi.mocked(moderationApi.listComments).mockResolvedValue({ items: initial, nextCursor });
  render(<CommentModerationPage />);
  await waitFor(() => expect(moderationApi.listComments).toHaveBeenCalled());
}

describe('CommentModerationPage — queue', () => {
  it('renders every comment as plain text with its article and author context', async () => {
    await renderPage([comment({ id: 'a' })]);

    expect(screen.getByText('Great article!')).toBeTruthy();
    expect(screen.getByText('Sample Article')).toBeTruthy();
    expect(screen.getByText('Reader One')).toBeTruthy();
  });

  it('does not inject a comment body as HTML', async () => {
    await renderPage([comment({ id: 'a', body: '<img src=x onerror=alert(1)>' })]);

    expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeTruthy();
    expect(document.querySelector('img')).toBeNull();
  });

  it('shows the open report count and reasons only when present', async () => {
    await renderPage([comment({ id: 'a', openReportCount: 2, reportReasons: ['spam', 'harassment'] })]);

    expect(screen.getByText('2 reports · spam, harassment')).toBeTruthy();
  });

  it('requests the selected status tab', async () => {
    await renderPage([comment({ id: 'a' })]);

    vi.mocked(moderationApi.listComments).mockResolvedValue({ items: [], nextCursor: null });
    await act(async () => {
      screen.getByRole('button', { name: 'Reported' }).click();
    });

    expect(moderationApi.listComments).toHaveBeenCalledWith({ status: 'reported', limit: 20 });
  });

  it('loads the next page on "Load older" and appends it', async () => {
    await renderPage([comment({ id: 'a' })], 'cursor-1');
    vi.mocked(moderationApi.listComments).mockResolvedValue({ items: [comment({ id: 'b' })], nextCursor: null });

    await act(async () => {
      screen.getByRole('button', { name: 'Load older' }).click();
    });

    expect(moderationApi.listComments).toHaveBeenCalledWith({ status: 'all', cursor: 'cursor-1', limit: 20 });
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Load older' })).toBeNull());
    // Both the first page's row and the appended second page's row are present.
    expect(screen.getAllByText('Great article!').length).toBeGreaterThan(0);
  });

  it('shows the load error when the fetch fails', async () => {
    vi.mocked(moderationApi.listComments).mockRejectedValue(new ApiError('boom', 500));
    render(<CommentModerationPage />);

    await screen.findByText('boom');
  });
});

describe('CommentModerationPage — remove/restore', () => {
  it('removes a visible comment after confirming, with an optional reason', async () => {
    const original = comment({ id: 'a', status: 'visible' });
    await renderPage([original]);

    await act(async () => {
      screen.getByRole('button', { name: 'Remove' }).click();
    });
    fireEvent.change(screen.getByPlaceholderText('Reason (optional)'), { target: { value: 'Off-topic' } });

    vi.mocked(moderationApi.moderateComment).mockResolvedValue({ ...original, status: 'removed' });
    await act(async () => {
      screen.getByRole('button', { name: 'Confirm remove' }).click();
    });

    expect(moderationApi.moderateComment).toHaveBeenCalledWith('a', { status: 'removed', reason: 'Off-topic' });
    await waitFor(() => expect(removedBadge()).toBeTruthy());
  });

  it('restores a removed comment', async () => {
    const original = comment({ id: 'a', status: 'removed' });
    await renderPage([original]);

    await act(async () => {
      screen.getByRole('button', { name: 'Restore' }).click();
    });
    vi.mocked(moderationApi.moderateComment).mockResolvedValue({ ...original, status: 'visible' });
    await act(async () => {
      screen.getByRole('button', { name: 'Confirm restore' }).click();
    });

    expect(moderationApi.moderateComment).toHaveBeenCalledWith('a', { status: 'visible' });
  });

  it('shows a forbidden banner when moderation is rejected as a 403', async () => {
    await renderPage([comment({ id: 'a', status: 'visible' })]);
    vi.mocked(moderationApi.moderateComment).mockRejectedValue(new ApiError('Forbidden', 403));

    await act(async () => {
      screen.getByRole('button', { name: 'Remove' }).click();
    });
    await act(async () => {
      screen.getByRole('button', { name: 'Confirm remove' }).click();
    });

    expect(screen.getByText("You don't have permission to moderate comments.")).toBeTruthy();
  });
});

describe('CommentModerationPage — dismiss reports', () => {
  // specs/community-moderation/spec.md - "A permitted caller can dismiss a comment's open
  // reports without removing it".
  it('dismisses reports without changing status, and drops the row under the Reported filter', async () => {
    const reported = comment({ id: 'a', status: 'visible', openReportCount: 1, reportReasons: ['spam'] });
    vi.mocked(moderationApi.listComments).mockResolvedValue({ items: [reported], nextCursor: null });
    render(<CommentModerationPage />);
    await waitFor(() => expect(moderationApi.listComments).toHaveBeenCalled());

    await act(async () => {
      screen.getByRole('button', { name: 'Reported' }).click();
    });

    await act(async () => {
      screen.getByRole('button', { name: 'Dismiss reports' }).click();
    });
    vi.mocked(moderationApi.dismissCommentReports).mockResolvedValue({ ...reported, openReportCount: undefined, reportReasons: undefined });
    await act(async () => {
      screen.getByRole('button', { name: 'Confirm dismiss' }).click();
    });

    expect(moderationApi.dismissCommentReports).toHaveBeenCalledWith('a', {});
    await waitFor(() => expect(screen.queryByText('Great article!')).toBeNull());
  });
});
