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

const CSRF_COOKIE = 'csrf_token';
const CSRF_HEADER = 'x-csrf-token';

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
  const res = await fetch(`${API_URL}${path}`, {
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
 * At most one `POST /auth/refresh` in flight, ever, shared by every request that discovers a 401
 * at roughly the same time. Single-flight here is load-bearing, not an optimization: the server
 * cannot tell a raced second presentation of a refresh credential from theft and revokes the
 * entire session lineage for either (`specs/authentication/spec.md` — "A second presentation is
 * treated as reuse regardless of intent"). Resolves to whether the refresh itself succeeded —
 * never throws.
 */
let inFlightRefresh: Promise<boolean> | null = null;
function refreshSession(): Promise<boolean> {
  if (!inFlightRefresh) {
    inFlightRefresh = rawFetch<void>('/auth/refresh', { method: 'POST' })
      .then(() => true)
      .catch(() => false)
      .finally(() => {
        inFlightRefresh = null;
      });
  }
  return inFlightRefresh;
}

/**
 * At most one in-flight `GET /auth/csrf` call, shared the same way refresh is. The endpoint
 * always answers 204, so failures here are only ever a network error; either way the caller
 * proceeds to retry once.
 */
let inFlightBootstrap: Promise<void> | null = null;
function bootstrapCsrfCookie(): Promise<void> {
  if (!inFlightBootstrap) {
    inFlightBootstrap = rawFetch<void>('/auth/csrf')
      .catch(() => undefined)
      .finally(() => {
        inFlightBootstrap = null;
      });
  }
  return inFlightBootstrap;
}

/**
 * The recovery algorithm: branch on the error before choosing a path, retry at most once total
 * across both paths combined, and never chain one recovery into the other
 * (`specs/reader-session/spec.md` — "Recovery paths do not chain"). `perform` is re-invoked
 * verbatim on retry — it captures whatever request-specific state the caller already closed
 * over.
 */
async function withRecovery<T>(perform: () => Promise<T>, alreadyRetried = false): Promise<T> {
  try {
    return await perform();
  } catch (err) {
    if (!(err instanceof ApiError) || alreadyRetried) {
      throw err;
    }

    if (err.status === 401) {
      const refreshed = await refreshSession();
      if (!refreshed) throw err;
      return withRecovery(perform, true);
    }

    if (err.status === 403 && err.code === 'csrf_failed') {
      await bootstrapCsrfCookie();
      return withRecovery(perform, true);
    }

    throw err;
  }
}

/** `GET /auth/me` through the recovery cycle. */
export function getReaderAccount(): Promise<ReaderAccountResponse> {
  return withRecovery(() => rawFetch<ReaderAccountResponse>('/auth/me'));
}

/** `POST /auth/logout` through the recovery cycle. */
export function signOutReader(): Promise<void> {
  return withRecovery(() => rawFetch<void>('/auth/logout', { method: 'POST' }));
}
