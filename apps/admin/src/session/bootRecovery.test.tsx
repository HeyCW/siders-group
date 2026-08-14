import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SessionProvider, useSession } from './SessionContext.js';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

interface QueuedResponse {
  status: number;
  body?: unknown;
}

function createFetchRouter() {
  const queues = new Map<string, QueuedResponse[]>();
  const callCounts = new Map<string, number>();
  function on(pathSuffix: string, ...responses: QueuedResponse[]): void {
    queues.set(pathSuffix, [...responses]);
  }
  function calls(pathSuffix: string): number {
    return callCounts.get(pathSuffix) ?? 0;
  }
  const fetchMock = vi.fn(async (url: string) => {
    const suffix = [...queues.keys()].find((k) => url.includes(k));
    if (!suffix) throw new Error(`Unhandled fetch to ${url}`);
    callCounts.set(suffix, (callCounts.get(suffix) ?? 0) + 1);
    const queue = queues.get(suffix) as QueuedResponse[];
    const next = (queue.length > 1 ? queue.shift() : queue[0]) as QueuedResponse;
    return { ok: next.status >= 200 && next.status < 300, status: next.status, json: async () => next.body };
  });
  return { on, calls, fetchMock };
}

function Consumer() {
  const { session } = useSession();
  return <div>status:{session.status}</div>;
}

/**
 * specs/admin-session/spec.md - "An expired access credential on load is recovered before
 * concluding that no session exists": the boot probe (`GET /users/me`) 403s `forbidden` only
 * because the 15-minute access credential expired while the refresh credential is still valid.
 * The real `apiFetch` interceptor (api.ts) must recover this transparently — the session
 * context never has to special-case it itself.
 */
describe('boot probe recovers a merely-expired access credential', () => {
  it('resolves to authenticated after a transparent refresh, with no special-casing in the session context', async () => {
    const router = createFetchRouter();
    router.on(
      '/users/me',
      { status: 403, body: { success: false, error: { code: 'forbidden', message: 'Staff session required' } } },
      { status: 200, body: { success: true, data: { id: 'staff-1', mustChangePassword: false } } },
    );
    router.on('/auth/refresh', { status: 204 });
    vi.stubGlobal('fetch', router.fetchMock);

    render(
      <MemoryRouter>
        <SessionProvider>
          <Consumer />
        </SessionProvider>
      </MemoryRouter>,
    );

    expect(screen.getByText('status:loading')).toBeTruthy();
    await waitFor(() => expect(screen.getByText('status:authenticated')).toBeTruthy());
    expect(router.calls('/auth/refresh')).toBe(1);
    expect(router.calls('/users/me')).toBe(2);
  });

  it('concludes unauthenticated only once refresh itself does not resolve the 403', async () => {
    const router = createFetchRouter();
    router.on('/users/me', {
      status: 403,
      body: { success: false, error: { code: 'forbidden', message: 'Staff session required' } },
    });
    router.on('/auth/refresh', {
      status: 401,
      body: { success: false, error: { code: 'invalid_refresh_token', message: 'x' } },
    });
    vi.stubGlobal('fetch', router.fetchMock);

    render(
      <MemoryRouter>
        <SessionProvider>
          <Consumer />
        </SessionProvider>
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByText('status:unauthenticated')).toBeTruthy());
  });
});
