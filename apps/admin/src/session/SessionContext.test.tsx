import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { SessionProvider, useSession } from './SessionContext.js';
import { sessionApi } from '../lib/sessionApi.js';
import { onSessionExpired, onSessionShouldReresolve } from '../lib/api.js';

vi.mock('../lib/sessionApi.js', () => ({
  sessionApi: { me: vi.fn(), logout: vi.fn() },
}));
vi.mock('../lib/api.js', () => ({
  onSessionExpired: vi.fn(() => () => {}),
  onSessionShouldReresolve: vi.fn(() => () => {}),
}));

afterEach(() => cleanup());

function Consumer() {
  const { session } = useSession();
  return <div>status:{session.status}</div>;
}

/**
 * The boot probe resolves session state once via `sessionApi.me()` — an expired access
 * credential is recovered transparently by `apiFetch`'s own interceptor before this ever
 * concludes "unauthenticated" (specs/admin-session/spec.md - "An expired access credential on
 * load is recovered before concluding that no session exists").
 */
describe('SessionProvider boot probe', () => {
  it('starts loading, then resolves to authenticated on a successful probe', async () => {
    vi.mocked(sessionApi.me).mockResolvedValue({ id: 'staff-1' } as never);

    render(
      <SessionProvider>
        <Consumer />
      </SessionProvider>,
    );

    expect(screen.getByText('status:loading')).toBeTruthy();
    await waitFor(() => expect(screen.getByText('status:authenticated')).toBeTruthy());
  });

  it('resolves to unauthenticated when the probe fails', async () => {
    vi.mocked(sessionApi.me).mockRejectedValue(new Error('no session'));

    render(
      <SessionProvider>
        <Consumer />
      </SessionProvider>,
    );

    await waitFor(() => expect(screen.getByText('status:unauthenticated')).toBeTruthy());
  });
});

/** The interceptor (api.ts) concluding mid-session that the session is gone reaches here
 *  through `onSessionExpired`, without any component needing to know why. */
describe('SessionProvider reacting to onSessionExpired', () => {
  it('transitions to unauthenticated when the interceptor reports the session expired', async () => {
    vi.mocked(sessionApi.me).mockResolvedValue({ id: 'staff-1' } as never);
    let notify: () => void = () => {};
    vi.mocked(onSessionExpired).mockImplementation((listener) => {
      notify = listener;
      return () => {};
    });

    render(
      <SessionProvider>
        <Consumer />
      </SessionProvider>,
    );
    await waitFor(() => expect(screen.getByText('status:authenticated')).toBeTruthy());

    act(() => notify());

    expect(screen.getByText('status:unauthenticated')).toBeTruthy();
  });
});

/**
 * A `password_change_required` 403 mid-session — the session itself is still valid, so this
 * re-reads the account (picking up `mustChangePassword`) rather than treating it as expired
 * (specs/admin-session/spec.md - "A mid-session 403 coded password_change_required routes to
 * the change screen, not to a recovery path").
 */
describe('SessionProvider reacting to onSessionShouldReresolve', () => {
  it('re-resolves the account in place, staying authenticated, when the interceptor reports a pending password change', async () => {
    vi.mocked(sessionApi.me).mockResolvedValueOnce({ id: 'staff-1', mustChangePassword: false } as never);
    let notify: () => void = () => {};
    vi.mocked(onSessionShouldReresolve).mockImplementation((listener) => {
      notify = listener;
      return () => {};
    });

    function AccountConsumer() {
      const { session } = useSession();
      const flag = session.status === 'authenticated' ? String(session.account.mustChangePassword) : 'n/a';
      return (
        <div>
          <div>status:{session.status}</div>
          <div>mustChangePassword:{flag}</div>
        </div>
      );
    }

    render(
      <SessionProvider>
        <AccountConsumer />
      </SessionProvider>,
    );
    await waitFor(() => expect(screen.getByText('status:authenticated')).toBeTruthy());
    expect(screen.getByText('mustChangePassword:false')).toBeTruthy();

    vi.mocked(sessionApi.me).mockResolvedValueOnce({ id: 'staff-1', mustChangePassword: true } as never);
    await act(async () => notify());

    expect(screen.getByText('status:authenticated')).toBeTruthy();
    expect(screen.getByText('mustChangePassword:true')).toBeTruthy();
  });
});

describe('SessionProvider signOut', () => {
  it('clears local session state even when the logout call itself fails', async () => {
    vi.mocked(sessionApi.me).mockResolvedValue({ id: 'staff-1' } as never);
    vi.mocked(sessionApi.logout).mockRejectedValue(new Error('network error'));

    function SignOutConsumer() {
      const { session, signOut } = useSession();
      // No .catch() here — signOut() itself must not reject on a failed logout call, or every
      // fire-and-forget call site (AppShell's button handler) would produce an unhandled
      // rejection.
      return (
        <div>
          <div>status:{session.status}</div>
          <button onClick={() => void signOut()}>sign out</button>
        </div>
      );
    }

    render(
      <SessionProvider>
        <SignOutConsumer />
      </SessionProvider>,
    );
    await waitFor(() => expect(screen.getByText('status:authenticated')).toBeTruthy());

    await act(async () => {
      screen.getByText('sign out').click();
    });

    expect(screen.getByText('status:unauthenticated')).toBeTruthy();
  });
});
