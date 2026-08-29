import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { ReaderSessionProvider, useReaderSession } from './readerSession';

const ACCOUNT = {
  id: '11111111-1111-1111-1111-111111111111',
  email: 'reader@example.com',
  name: 'Charles',
  avatarUrl: null,
  status: 'active' as const,
  createdAt: '2026-08-01T00:00:00.000Z',
};

function jsonResponse(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

function setCsrfCookie(value: string | null): void {
  document.cookie = 'csrf_token=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
  if (value !== null) {
    document.cookie = `csrf_token=${encodeURIComponent(value)}; path=/`;
  }
}

function Probe() {
  const { session, signOut } = useReaderSession();
  if (session.status === 'loading') return <span>loading</span>;
  if (session.status === 'anonymous') return <span>anonymous</span>;
  return (
    <>
      <span>authenticated:{session.account.name}</span>
      <button onClick={() => void signOut()}>sign out</button>
    </>
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  setCsrfCookie(null);
});

describe('ReaderSessionProvider', () => {
  it('resolves anonymous immediately, with no fetch, when no CSRF cookie is present', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    setCsrfCookie(null);

    render(
      <ReaderSessionProvider>
        <Probe />
      </ReaderSessionProvider>,
    );

    await waitFor(() => expect(screen.getByText('anonymous')).toBeInTheDocument());
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('resolves authenticated with the account when the probe succeeds', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ success: true, data: ACCOUNT })));
    setCsrfCookie('token');

    render(
      <ReaderSessionProvider>
        <Probe />
      </ReaderSessionProvider>,
    );

    await waitFor(() => expect(screen.getByText('authenticated:Charles')).toBeInTheDocument());
  });

  it('resolves anonymous when sign-out succeeds', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/auth/logout')) return Promise.resolve(jsonResponse(undefined, 204));
      return Promise.resolve(jsonResponse({ success: true, data: ACCOUNT }));
    });
    vi.stubGlobal('fetch', fetchMock);
    setCsrfCookie('token');

    render(
      <ReaderSessionProvider>
        <Probe />
      </ReaderSessionProvider>,
    );
    await waitFor(() => expect(screen.getByText('authenticated:Charles')).toBeInTheDocument());

    await act(async () => {
      screen.getByRole('button', { name: 'sign out' }).click();
    });

    await waitFor(() => expect(screen.getByText('anonymous')).toBeInTheDocument());
  });

  it('resolves anonymous even when the sign-out call fails', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/auth/logout')) {
        return Promise.resolve(jsonResponse({ success: false, error: { code: 'unauthenticated', message: 'x' } }, 401));
      }
      return Promise.resolve(jsonResponse({ success: true, data: ACCOUNT }));
    });
    vi.stubGlobal('fetch', fetchMock);
    setCsrfCookie('token');

    render(
      <ReaderSessionProvider>
        <Probe />
      </ReaderSessionProvider>,
    );
    await waitFor(() => expect(screen.getByText('authenticated:Charles')).toBeInTheDocument());

    await act(async () => {
      screen.getByRole('button', { name: 'sign out' }).click();
    });

    await waitFor(() => expect(screen.getByText('anonymous')).toBeInTheDocument());
  });
});
