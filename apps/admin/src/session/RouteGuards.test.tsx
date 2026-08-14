import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { RedirectIfAuthenticated, RequireSession } from './RouteGuards.js';
import { useSession, type SessionContextValue } from './SessionContext.js';
import { DEFAULT_LANDING_ROUTE } from './redirectTarget.js';

vi.mock('./SessionContext.js', () => ({ useSession: vi.fn() }));

afterEach(() => cleanup());

function mockSession(session: SessionContextValue['session']): void {
  vi.mocked(useSession).mockReturnValue({
    session,
    refreshAccount: vi.fn(),
    signIn: vi.fn(),
    signOut: vi.fn(),
  });
}

/** specs/admin-session/spec.md - "Session presence gates every route except sign-in". */
describe('RequireSession', () => {
  it('redirects to /login when no session resolves, rendering none of the protected content', () => {
    mockSession({ status: 'unauthenticated' });
    render(
      <MemoryRouter initialEntries={['/articles']}>
        <Routes>
          <Route path="/login" element={<div>Login Screen</div>} />
          <Route
            path="/articles"
            element={
              <RequireSession>
                <div>Articles</div>
              </RequireSession>
            }
          />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText('Login Screen')).toBeTruthy();
    expect(screen.queryByText('Articles')).toBeNull();
  });

  it('renders the protected route once a session resolves', () => {
    mockSession({ status: 'authenticated', account: { id: '1' } as never });
    render(
      <MemoryRouter initialEntries={['/articles']}>
        <Routes>
          <Route
            path="/articles"
            element={
              <RequireSession>
                <div>Articles</div>
              </RequireSession>
            }
          />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText('Articles')).toBeTruthy();
  });

  it('shows nothing of the protected route while the session is still resolving', () => {
    mockSession({ status: 'loading' });
    render(
      <MemoryRouter initialEntries={['/articles']}>
        <Routes>
          <Route
            path="/articles"
            element={
              <RequireSession>
                <div>Articles</div>
              </RequireSession>
            }
          />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.queryByText('Articles')).toBeNull();
  });

  /** specs/admin-session/spec.md - "Deep link is restored after sign-in". */
  it('preserves the originally requested path in navigation state for sign-in to restore', () => {
    mockSession({ status: 'unauthenticated' });
    function LoginRoute() {
      const location = useLocation();
      const from = (location.state as { from?: string } | null)?.from;
      return <div>preserved:{from}</div>;
    }
    render(
      <MemoryRouter initialEntries={['/articles/42?tab=history']}>
        <Routes>
          <Route path="/login" element={<LoginRoute />} />
          <Route
            path="/articles/:id"
            element={
              <RequireSession>
                <div>Article</div>
              </RequireSession>
            }
          />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText('preserved:/articles/42?tab=history')).toBeTruthy();
  });
});

/** specs/admin-session/spec.md - "A pending password change confines the app to the change
 *  screen". */
describe('RequireSession — pending password change', () => {
  it('blocks navigation to any other route while mustChangePassword is set, from the account state', () => {
    mockSession({ status: 'authenticated', account: { mustChangePassword: true } as never });
    render(
      <MemoryRouter initialEntries={['/articles']}>
        <Routes>
          <Route path="/change-password" element={<div>Change Password Screen</div>} />
          <Route
            path="/articles"
            element={
              <RequireSession>
                <div>Articles</div>
              </RequireSession>
            }
          />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText('Change Password Screen')).toBeTruthy();
    expect(screen.queryByText('Articles')).toBeNull();
  });

  it('renders the change-password route itself without redirecting', () => {
    mockSession({ status: 'authenticated', account: { mustChangePassword: true } as never });
    render(
      <MemoryRouter initialEntries={['/change-password']}>
        <Routes>
          <Route
            path="/change-password"
            element={
              <RequireSession>
                <div>Change Password Screen</div>
              </RequireSession>
            }
          />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText('Change Password Screen')).toBeTruthy();
  });

  it('allows navigation to any route once the restriction is lifted', () => {
    mockSession({ status: 'authenticated', account: { mustChangePassword: false } as never });
    render(
      <MemoryRouter initialEntries={['/articles']}>
        <Routes>
          <Route
            path="/articles"
            element={
              <RequireSession>
                <div>Articles</div>
              </RequireSession>
            }
          />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText('Articles')).toBeTruthy();
  });
});

/** specs/admin-session/spec.md - "An already-signed-in caller visiting sign-in is sent into the
 *  app". */
describe('RedirectIfAuthenticated', () => {
  it('redirects an already-signed-in caller away from the sign-in form', () => {
    mockSession({ status: 'authenticated', account: { id: '1' } as never });
    render(
      <MemoryRouter initialEntries={['/login']}>
        <Routes>
          <Route
            path="/login"
            element={
              <RedirectIfAuthenticated>
                <div>Login Form</div>
              </RedirectIfAuthenticated>
            }
          />
          <Route path={DEFAULT_LANDING_ROUTE} element={<div>Landing</div>} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText('Landing')).toBeTruthy();
    expect(screen.queryByText('Login Form')).toBeNull();
  });

  it('renders the sign-in form for a caller with no resolved session', () => {
    mockSession({ status: 'unauthenticated' });
    render(
      <MemoryRouter initialEntries={['/login']}>
        <Routes>
          <Route
            path="/login"
            element={
              <RedirectIfAuthenticated>
                <div>Login Form</div>
              </RedirectIfAuthenticated>
            }
          />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText('Login Form')).toBeTruthy();
  });
});
