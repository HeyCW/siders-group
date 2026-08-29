import type { ReaderAccountResponse } from '@siders/contracts';
import { API_URL } from './env';

interface ErrorEnvelope {
  success: false;
  error: { code: string; message: string };
}

function isErrorEnvelope(value: unknown): value is ErrorEnvelope {
  return typeof value === 'object' && value !== null && 'error' in value;
}

/**
 * Carries the server's error `code` and HTTP `status`, matching `lib/api.ts`'s `ApiError` and
 * `apps/admin/src/lib/api.ts`'s — same shape, distinct class, since this client's recovery cycle
 * keys on 401 (`requireReader()` — `apps/api/src/middleware/authorize.ts`) rather than the admin
 * client's 403 (`design.md` — "Readers are rejected with 401, staff with 403").
 */
export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// Sanctum's own double-submit pair (not the old Node app's custom `csrf_token`/`x-csrf-token`
// scheme) — `XSRF-TOKEN` is deliberately script-readable (not httpOnly) so this can echo it back.
const CSRF_COOKIE = 'XSRF-TOKEN';
const CSRF_HEADER = 'X-XSRF-TOKEN';

/**
 * Whether this browser holds the script-readable CSRF cookie — the anonymous fast path's only
 * signal, checked before any network call (`design.md` — "The CSRF cookie's presence is the
 * anonymous fast path"). Not a credential and proves nothing to the server; it only saves a
 * round trip for the overwhelming majority of visitors who hold no session at all.
 */
export function hasCsrfCookie(): boolean {
  if (typeof document === 'undefined') return false;
  return document.cookie.split('; ').some((c) => c.startsWith(`${CSRF_COOKIE}=`));
}

function csrfHeader(): Record<string, string> {
  if (typeof document === 'undefined') return {};
  const match = document.cookie.split('; ').find((c) => c.startsWith(`${CSRF_COOKIE}=`));
  if (!match) return {};
  return { [CSRF_HEADER]: decodeURIComponent(match.slice(CSRF_COOKIE.length + 1)) };
}

/** The network call and JSON parsing only — no recovery. Never re-entered by the recovery paths
 *  below, which call this directly to avoid recursing into themselves. */
async function rawFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}/api${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...csrfHeader(),
      ...init?.headers,
    },
  });
  const payload: unknown = await res.json().catch(() => undefined);

  if (!res.ok) {
    const envelope = isErrorEnvelope(payload) ? payload.error : undefined;
    throw new ApiError(
      envelope?.message ?? `Request to ${path} failed with status ${res.status}`,
      res.status,
      envelope?.code,
    );
  }

  // A 204 (refresh, logout, csrf bootstrap) has no body — `payload` is `undefined` and there is
  // no envelope to unwrap. `T` is `void` for every such caller.
  if (payload === undefined) return undefined as T;
  return (payload as { data: T }).data;
}

/**
 * At most one in-flight `GET /sanctum/csrf-cookie` call, shared by every request that discovers a
 * stale/missing CSRF cookie at roughly the same time. Hits Sanctum's own route directly —
 * deliberately NOT prefixed with `/api` like every other endpoint here, since Sanctum registers
 * it at the application root.
 */
let inFlightBootstrap: Promise<void> | null = null;
function bootstrapCsrfCookie(): Promise<void> {
  if (!inFlightBootstrap) {
    inFlightBootstrap = fetch(`${API_URL}/sanctum/csrf-cookie`, { credentials: 'include' })
      .then(() => undefined)
      .catch(() => undefined)
      .finally(() => {
        inFlightBootstrap = null;
      });
  }
  return inFlightBootstrap;
}

/**
 * The recovery algorithm: retry at most once. There is no refresh-token concept under Sanctum's
 * session-cookie auth (unlike the old Node app's JWT+refresh scheme) — a 401 means the reader
 * simply isn't signed in (or the session is gone), which every caller here already treats as a
 * normal "anonymous" outcome rather than an error to recover from.
 */
async function withRecovery<T>(perform: () => Promise<T>, alreadyRetried = false): Promise<T> {
  try {
    return await perform();
  } catch (err) {
    if (!(err instanceof ApiError) || alreadyRetried) {
      throw err;
    }

    // Laravel's TokenMismatchException renders as 419, not 403 — checked by code, not status,
    // in case that ever changes.
    if (err.code === 'csrf_failed') {
      await bootstrapCsrfCookie();
      return withRecovery(perform, true);
    }

    throw err;
  }
}

/**
 * Any API call that should travel with the reader's session, through the one recovery cycle.
 *
 * Exported so `engagementApi.ts` reuses this cycle rather than growing a second — the rule
 * `docs/ARCHITECTURE.md` §8.1 states directly: "A single fetch wrapper handles the 401 → refresh
 * → retry cycle in one place; never scatter that logic across call sites." It also carries the
 * two things a hand-rolled `fetch` in a sibling module would have had to reimplement and would
 * eventually have drifted on: `credentials: 'include'`, and the `x-csrf-token` header that
 * `apps/api/src/lib/csrf.ts` demands of every state-changing request from a browser holding a
 * session cookie.
 *
 * Safe for endpoints that need no session at all. An anonymous browser holds no CSRF cookie, so
 * no header is attached, and the API's CSRF middleware passes such requests through untouched.
 */
export function readerRequest<T>(path: string, init?: RequestInit): Promise<T> {
  return withRecovery(() => rawFetch<T>(path, init));
}

/** `GET /reader/me` through the recovery cycle. */
export function getReaderAccount(): Promise<ReaderAccountResponse> {
  return readerRequest<ReaderAccountResponse>('/reader/me');
}

/** `POST /reader/logout` through the recovery cycle. */
export function signOutReader(): Promise<void> {
  return readerRequest<void>('/reader/logout', { method: 'POST' });
}
