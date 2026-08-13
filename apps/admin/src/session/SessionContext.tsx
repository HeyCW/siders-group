import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { onSessionExpired, onSessionShouldReresolve } from '../lib/api.js';
import { sessionApi, type StaffMeResponse } from '../lib/sessionApi.js';

export type SessionState =
  | { status: 'loading' }
  | { status: 'authenticated'; account: StaffMeResponse }
  | { status: 'unauthenticated' };

export interface SessionContextValue {
  session: SessionState;
  /** Re-resolves the caller's own account in place — used after a password change lifts the
   *  forced-change restriction without a fresh sign-in
   *  (specs/admin-session/spec.md - "A successful change releases the restriction"). */
  refreshAccount: () => Promise<void>;
  /** Resolves the caller's own account after a successful sign-in submission, since that
   *  response carries no body to route from
   *  (specs/admin-session/spec.md - "Account state is determined from the caller's own
   *  account"). Throws if the account can't be read even though sign-in itself succeeded. */
  signIn: () => Promise<StaffMeResponse>;
  /** Calls the sign-out endpoint and clears local state regardless of the call's outcome
   *  (specs/admin-session/spec.md - "A failed sign-out call still returns to sign-in"). */
  signOut: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<SessionState>({ status: 'loading' });

  const resolve = useCallback(async (): Promise<StaffMeResponse | null> => {
    try {
      const account = await sessionApi.me();
      setSession({ status: 'authenticated', account });
      return account;
    } catch {
      setSession({ status: 'unauthenticated' });
      return null;
    }
  }, []);

  // The boot probe: resolves session state once via the same probe + recovery algorithm every
  // other request goes through (an expired access credential is recovered transparently by
  // apiFetch's interceptor before this ever concludes "unauthenticated") — see api.ts.
  useEffect(() => {
    resolve();
  }, [resolve]);

  // The interceptor concluding mid-session that the session is gone (a failed refresh, or a
  // still-403 retry whose re-probe also failed) reaches here without any component having made
  // a request itself.
  useEffect(() => onSessionExpired(() => setSession({ status: 'unauthenticated' })), []);

  // A mid-session `password_change_required` 403 — the session itself is still valid, so this
  // re-reads the account rather than treating it as expired; RequireSession picks up the
  // resulting `mustChangePassword` flag and confines the app to the change screen on its own.
  useEffect(() => onSessionShouldReresolve(() => void resolve()), [resolve]);

  const refreshAccount = useCallback(async () => {
    await resolve();
  }, [resolve]);

  const signIn = useCallback(async () => {
    const account = await resolve();
    if (!account) throw new Error('Sign-in succeeded but the account could not be read');
    return account;
  }, [resolve]);

  const signOut = useCallback(async () => {
    try {
      await sessionApi.logout();
    } catch {
      // Not reported — the local session ends either way (see finally below).
    } finally {
      setSession({ status: 'unauthenticated' });
    }
  }, []);

  return (
    <SessionContext.Provider value={{ session, refreshAccount, signIn, signOut }}>{children}</SessionContext.Provider>
  );
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used within a SessionProvider');
  return ctx;
}
