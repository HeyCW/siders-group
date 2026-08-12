import { useCallback, useState } from 'react';
import { ApiError } from '../lib/api.js';

export interface AsyncActionState {
  loading: boolean;
  /** Set when the server rejected the action as forbidden — the UI treats this as authoritative
   *  rather than pre-computing the caller's permissions (specs/article-management/spec.md -
   *  "Permission-gated article endpoints"; tasks.md - 11.6). */
  forbidden: boolean;
  errorMessage: string | null;
}

/**
 * Wraps a mutating call so every action button in the admin UI reacts to the server's own
 * authorization decision — a 403 sets `forbidden`, which callers use to disable the control and
 * show why, instead of maintaining a separate client-side permission model that could drift
 * from the real one.
 *
 * `run` re-throws on failure rather than returning a sentinel value. A call whose success value
 * is legitimately `undefined` (e.g. a `delete` returning `void`) would otherwise be
 * indistinguishable from a failed call by its return value alone — callers that need to know
 * "did this succeed" use try/catch, the same as any other async call.
 */
export function useAsyncAction<Args extends unknown[], R>(
  action: (...args: Args) => Promise<R>,
): [AsyncActionState, (...args: Args) => Promise<R>] {
  const [state, setState] = useState<AsyncActionState>({ loading: false, forbidden: false, errorMessage: null });

  const run = useCallback(
    async (...args: Args) => {
      setState({ loading: true, forbidden: false, errorMessage: null });
      try {
        const result = await action(...args);
        setState({ loading: false, forbidden: false, errorMessage: null });
        return result;
      } catch (err) {
        const isForbidden = err instanceof ApiError && err.status === 403;
        const message = err instanceof Error ? err.message : 'Something went wrong';
        setState({ loading: false, forbidden: isForbidden, errorMessage: message });
        throw err;
      }
    },
    [action],
  );

  return [state, run];
}
