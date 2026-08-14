import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { LoginPage } from './LoginPage.js';
import { useSession } from '../session/SessionContext.js';
import { DEFAULT_LANDING_ROUTE } from '../session/redirectTarget.js';

// sessionApi and api.ts are deliberately NOT mocked here — this exercises the real
// apiFetch interceptor (api.ts) so the recovery actually runs, not a stand-in for it.
vi.mock('../session/SessionContext.js', () => ({ useSession: vi.fn() }));

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
  function on(pathSuffix: string, ...responses: QueuedResponse[]): void {
    queues.set(pathSuffix, [...responses]);
  }
  const fetchMock = vi.fn(async (url: string) => {
    const suffix = [...queues.keys()].find((k) => url.includes(k));
    if (!suffix) throw new Error(`Unhandled fetch to ${url}`);
    const queue = queues.get(suffix) as QueuedResponse[];
    const next = (queue.length > 1 ? queue.shift() : queue[0]) as QueuedResponse;
    return { ok: next.status >= 200 && next.status < 300, status: next.status, json: async () => next.body };
  });
  return { on, fetchMock };
}

/**
 * specs/admin-session/spec.md - "Sign-in recovers from a stale CSRF cookie the same way":
 * a `csrf_failed` on the sign-in submission is recovered via bootstrap + one retry before the
 * generic failure message is ever shown — this is a stale-cookie retry that goes on to
 * succeed, not a genuinely rejected attempt.
 */
describe('LoginPage recovering from a stale CSRF cookie on submission', () => {
  it('recovers and enters the app, without ever showing the generic failure message', async () => {
    const router = createFetchRouter();
    router.on('/auth/staff/login', { status: 403, body: { success: false, error: { code: 'csrf_failed', message: 'x' } } }, {
      status: 204,
    });
    router.on('/auth/csrf', { status: 204 });
    vi.stubGlobal('fetch', router.fetchMock);

    vi.mocked(useSession).mockReturnValue({
      session: { status: 'unauthenticated' },
      refreshAccount: vi.fn(),
      signIn: vi.fn().mockResolvedValue({ mustChangePassword: false }),
      signOut: vi.fn(),
    });

    render(
      <MemoryRouter initialEntries={['/login']}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path={DEFAULT_LANDING_ROUTE} element={<div>Landing</div>} />
        </Routes>
      </MemoryRouter>,
    );

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@b.com' } });
      fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'whatever1' } });
      fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    });

    expect(screen.queryByText('Invalid email or password.')).toBeNull();
    expect(screen.getByText('Landing')).toBeTruthy();
  });
});
