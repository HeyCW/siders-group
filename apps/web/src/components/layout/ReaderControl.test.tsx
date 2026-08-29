import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ReaderControl } from './ReaderControl';
import { ReaderSessionProvider } from '../../lib/readerSession';
import type * as ReactRouterDom from 'react-router-dom';

const ACCOUNT = {
  id: '11111111-1111-1111-1111-111111111111',
  email: 'reader@example.com',
  name: 'Charles',
  avatarUrl: null,
  status: 'active' as const,
  createdAt: '2026-08-01T00:00:00.000Z',
};

vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof ReactRouterDom>()),
  useLocation: () => ({ pathname: '/news/some-article' }),
}));

function jsonResponse(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

function setCsrfCookie(value: string | null): void {
  document.cookie = 'csrf_token=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
  if (value !== null) {
    document.cookie = `csrf_token=${encodeURIComponent(value)}; path=/`;
  }
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  setCsrfCookie(null);
});

describe('ReaderControl', () => {
  it('renders a sign-in control and no reader identity when anonymous', async () => {
    vi.stubGlobal('fetch', vi.fn());
    setCsrfCookie(null);

    render(
      <ReaderSessionProvider>
        <ReaderControl />
      </ReaderSessionProvider>,
    );

    const link = await screen.findByRole('link', { name: /sign in/i });
    expect(link).toBeInTheDocument();
    expect(screen.queryByText('Charles')).not.toBeInTheDocument();
  });

  it('carries the current in-app location as next and names no other origin', async () => {
    vi.stubGlobal('fetch', vi.fn());
    setCsrfCookie(null);

    render(
      <ReaderSessionProvider>
        <ReaderControl />
      </ReaderSessionProvider>,
    );

    const link = await screen.findByRole('link', { name: /sign in/i });
    const href = link.getAttribute('href') ?? '';
    expect(href).toContain('/auth/google?next=');
    expect(href).toContain(encodeURIComponent('/news/some-article'));
    expect(href.startsWith('http://localhost:4000/')).toBe(true);
  });

  it('carries the query string into next on click, which usePathname alone drops', async () => {
    vi.stubGlobal('fetch', vi.fn());
    setCsrfCookie(null);
    window.history.pushState({}, '', '/news?category=budaya');

    render(
      <ReaderSessionProvider>
        <ReaderControl />
      </ReaderSessionProvider>,
    );

    const link = await screen.findByRole('link', { name: /sign in/i });
    // Rendered href (from usePathname, no query) — confirms the gap this click handler closes.
    expect(link.getAttribute('href') ?? '').not.toContain(encodeURIComponent('?category=budaya'));

    fireEvent.click(link);

    expect(link.getAttribute('href') ?? '').toContain(encodeURIComponent('/news?category=budaya'));
  });

  it('renders the name and a sign-out control when authenticated', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ success: true, data: ACCOUNT })));
    setCsrfCookie('token');

    render(
      <ReaderSessionProvider>
        <ReaderControl />
      </ReaderSessionProvider>,
    );

    expect(await screen.findByText('Charles')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign out/i })).toBeInTheDocument();
  });

  it('renders no signed-in presentation while loading', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise(() => {})), // never resolves — stays in `loading`
    );
    setCsrfCookie('token');

    render(
      <ReaderSessionProvider>
        <ReaderControl />
      </ReaderSessionProvider>,
    );

    expect(screen.queryByText('Charles')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /sign in/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /sign out/i })).not.toBeInTheDocument();
  });
});
