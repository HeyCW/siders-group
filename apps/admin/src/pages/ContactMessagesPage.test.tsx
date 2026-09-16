import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import type { ContactMessageRow } from '@siders/contracts';
import { ContactMessagesPage } from './ContactMessagesPage.js';
import { contactApi } from '../lib/contactApi.js';
import { ApiError } from '../lib/api.js';

vi.mock('../lib/contactApi.js', () => ({
  contactApi: {
    list: vi.fn(),
    unreadCount: vi.fn(),
    setStatus: vi.fn(),
  },
}));

afterEach(() => cleanup());

/** The status badge on a message row shares its label text with the "Unread" filter tab —
 *  disambiguated by tag, the same way `RolesPage.test.tsx` disambiguates duplicate labels by id. */
function unreadBadge(): HTMLElement | undefined {
  return screen.queryAllByText('Unread').find((el) => el.tagName === 'SPAN');
}

function message(overrides: Partial<ContactMessageRow> & Pick<ContactMessageRow, 'id'>): ContactMessageRow {
  return {
    name: 'Jane Doe',
    organisation: null,
    email: 'jane@example.com',
    subject: 'Hello',
    message: 'Just saying hi.',
    status: 'new',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

async function renderPage(initial: ContactMessageRow[] = []) {
  vi.mocked(contactApi.list).mockResolvedValue(initial);
  render(<ContactMessagesPage />);
  await waitFor(() => expect(contactApi.list).toHaveBeenCalled());
}

describe('ContactMessagesPage — inbox', () => {
  // specs/contact-messages/spec.md - "The inbox lists messages filterable by read status, newest first".
  it('renders every message with an unread badge for new ones', async () => {
    await renderPage([message({ id: 'a', status: 'new' })]);

    expect(screen.getByText('Hello')).toBeTruthy();
    expect(screen.getByText('Just saying hi.')).toBeTruthy();
    expect(unreadBadge()).toBeTruthy();
  });

  it('renders the message body as a plain text node, never injected as HTML', async () => {
    await renderPage([message({ id: 'a', message: '<img src=x onerror=alert(1)>' })]);

    // Rendered literally as text — a real injected <img> would not be queryable as text.
    expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeTruthy();
    expect(document.querySelector('img')).toBeNull();
  });

  it('shows an empty state with no messages', async () => {
    await renderPage([]);

    expect(screen.getByText('No messages here.')).toBeTruthy();
  });

  it('requests the selected status filter from the server', async () => {
    await renderPage([message({ id: 'a' })]);

    vi.mocked(contactApi.list).mockResolvedValue([]);
    await act(async () => {
      screen.getByRole('button', { name: 'Unread' }).click();
    });

    expect(contactApi.list).toHaveBeenCalledWith({ status: 'new' });
  });

  it('shows the load error when the fetch fails', async () => {
    vi.mocked(contactApi.list).mockRejectedValue(new ApiError('boom', 500));
    render(<ContactMessagesPage />);

    await screen.findByText('boom');
  });
});

describe('ContactMessagesPage — mark read/unread', () => {
  it('toggles a message from new to read', async () => {
    const original = message({ id: 'a', status: 'new' });
    await renderPage([original]);
    vi.mocked(contactApi.setStatus).mockResolvedValue({ ...original, status: 'read' });

    await act(async () => {
      screen.getByRole('button', { name: 'Mark read' }).click();
    });

    expect(contactApi.setStatus).toHaveBeenCalledWith('a', { status: 'read' });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Mark unread' })).toBeTruthy());
    expect(unreadBadge()).toBeUndefined();
  });

  it('shows a forbidden banner when the toggle is rejected as a 403', async () => {
    await renderPage([message({ id: 'a', status: 'new' })]);
    vi.mocked(contactApi.setStatus).mockRejectedValue(new ApiError('Forbidden', 403));

    await act(async () => {
      screen.getByRole('button', { name: 'Mark read' }).click();
    });

    expect(screen.getByText("You don't have permission to manage contact messages.")).toBeTruthy();
  });
});

describe('ContactMessagesPage — polling', () => {
  // `docs/ARCHITECTURE.md` §8.2 - "a queue two people look at" is the same reasoning behind this
  // screen's 30-second auto-refresh.
  it('registers a 30-second poll for the current filter', async () => {
    const setIntervalSpy = vi.spyOn(window, 'setInterval');
    await renderPage([]);

    expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 30_000);
  });

  it('re-requests the list with a manual Refresh click', async () => {
    await renderPage([]);

    vi.mocked(contactApi.list).mockClear();
    await act(async () => {
      screen.getByRole('button', { name: 'Refresh' }).click();
    });

    expect(contactApi.list).toHaveBeenCalledTimes(1);
  });
});
