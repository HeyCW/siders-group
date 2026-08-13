import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useSession } from './SessionContext.js';
import { DEFAULT_LANDING_ROUTE } from './redirectTarget.js';

function LoadingScreen() {
  return <div className="p-8 text-gray-500 dark:text-gray-400">Loading…</div>;
}

function currentPath(location: { pathname: string; search: string; hash: string }): string {
  return `${location.pathname}${location.search}${location.hash}`;
}

const CHANGE_PASSWORD_ROUTE = '/change-password';

/**
 * Gates every route it wraps behind a resolved session
 * (specs/admin-session/spec.md - "Session presence gates every route except sign-in"). The
 * requested path is preserved in navigation state so sign-in can return the caller to it
 * (specs/admin-session/spec.md - "Deep link is restored after sign-in").
 *
 * Also confines a session whose account requires a password change to the change screen alone
 * — sourced from the caller's own account state on every render, not a one-time assumption
 * made at sign-in (specs/admin-session/spec.md - "A pending password change confines the app
 * to the change screen").
 */
export function RequireSession({ children }: { children: ReactNode }) {
  const { session } = useSession();
  const location = useLocation();

  if (session.status === 'loading') return <LoadingScreen />;

  if (session.status === 'unauthenticated') {
    return <Navigate to="/login" replace state={{ from: currentPath(location) }} />;
  }

  if (session.account.mustChangePassword && location.pathname !== CHANGE_PASSWORD_ROUTE) {
    return <Navigate to={CHANGE_PASSWORD_ROUTE} replace />;
  }

  return <>{children}</>;
}

/** The inverse guard for `/login` itself — an already-signed-in caller is sent into the app
 *  rather than shown the sign-in form again
 *  (specs/admin-session/spec.md - "An already-signed-in caller visiting sign-in is sent into
 *  the app"). */
export function RedirectIfAuthenticated({ children }: { children: ReactNode }) {
  const { session } = useSession();

  if (session.status === 'loading') return <LoadingScreen />;

  if (session.status === 'authenticated') {
    return <Navigate to={DEFAULT_LANDING_ROUTE} replace />;
  }

  return <>{children}</>;
}
