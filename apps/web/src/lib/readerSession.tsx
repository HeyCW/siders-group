import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { ReaderAccountResponse } from '@siders/contracts';
import { getReaderAccount, hasCsrfCookie, signOutReader } from './authApi';

export type ReaderSessionState =
  | { status: 'loading' }
  | { status: 'authenticated'; account: ReaderAccountResponse }
  | { status: 'anonymous' };

export interface ReaderSessionContextValue {
  session: ReaderSessionState;
  /** Calls the sign-out endpoint and resolves to anonymous either way
   *  (`specs/reader-session/spec.md` - "Sign-out ends the local session regardless of the
   *  call's outcome"). */
  signOut: () => Promise<void>;
}

const ReaderSessionContext = createContext<ReaderSessionContextValue | null>(null);

export function ReaderSessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<ReaderSessionState>({ status: 'loading' });

  useEffect(() => {
    // The anonymous fast path: no CSRF cookie means no session, resolved without a single
    // network call (`specs/reader-session/spec.md` - "A reader with no session marker triggers
    // no session request").
    if (!hasCsrfCookie()) {
      setSession({ status: 'anonymous' });
      return;
    }
    getReaderAccount()
      .then((account) => setSession({ status: 'authenticated', account }))
      .catch(() => setSession({ status: 'anonymous' }));
  }, []);

  const signOut = useCallback(async () => {
    try {
      await signOutReader();
    } catch {
      // Not reported — the local session ends either way.
    } finally {
      setSession({ status: 'anonymous' });
    }
  }, []);

  return (
    <ReaderSessionContext.Provider value={{ session, signOut }}>{children}</ReaderSessionContext.Provider>
  );
}

export function useReaderSession(): ReaderSessionContextValue {
  const ctx = useContext(ReaderSessionContext);
  if (!ctx) throw new Error('useReaderSession must be used within a ReaderSessionProvider');
  return ctx;
}
