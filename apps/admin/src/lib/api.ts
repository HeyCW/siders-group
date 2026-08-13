const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';

export interface ApiRequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  /**
   * Set only on the sign-in screen's own credential submission. A 403 there can only ever be a
   * stale CSRF cookie — there is no session at all to refresh — so this request is excluded
   * from the refresh-recovery path entirely, while still recovering via the CSRF bootstrap path
   * like every other request (specs/admin-session/spec.md - "The sign-in screen's own
   * submission never triggers a refresh").
   */
  isSignIn?: boolean;
}

interface ErrorEnvelope {
  success: false;
  error: { code: string; message: string };
}

/**
 * Carries the server's error `code` and HTTP `status` alongside the message, so a caller can
 * react to a specific failure (e.g. `code === 'slug_conflict'`) or to `status === 403` — the
 * latter is how the admin UI treats a permission denial as authoritative rather than
 * pre-computing the caller's permissions client-side
 * (specs/article-management/spec.md - "Permission-gated article endpoints").
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

function isErrorEnvelope(value: unknown): value is ErrorEnvelope {
  return typeof value === 'object' && value !== null && 'error' in value;
}

const CSRF_COOKIE = 'csrf_token';
const CSRF_HEADER = 'x-csrf-token';

/**
 * The server's half of the double-submit pair. `sid_at`/`sid_rt` are httpOnly and unreadable
 * here by design; `csrf_token` is deliberately set `httpOnly: false` precisely so this function
 * can read it and echo it back (`apps/api/src/lib/csrf.ts` - "must be script-readable — the
 * client echoes it back as a header").
 *
 * Without this, `createCsrfMiddleware` rejects **every** POST/PATCH/DELETE that carries a
 * session cookie — which is every write the admin app makes. Omitting it did not fail loudly at
 * build time or in any unit test; it simply made autosave, publish, delete, taxonomy CRUD and
 * image upload all return `403 csrf_failed` in a real browser.
 */
function csrfHeader(): Record<string, string> {
  const match = document.cookie.split('; ').find((c) => c.startsWith(`${CSRF_COOKIE}=`));
  if (!match) return {};
  return { [CSRF_HEADER]: decodeURIComponent(match.slice(CSRF_COOKIE.length + 1)) };
}

/** The network call and JSON parsing only — no recovery. Used for ordinary requests and,
 *  directly, by the recovery mechanisms below, which must never re-enter the interceptor
 *  (design.md - single-flight refresh, single-flight bootstrap). */
async function rawFetch<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  // `isSignIn` rides along in `rest` and ends up in `init` — harmless, since `fetch()` ignores
  // properties it doesn't recognize.
  const { body, ...rest } = options;
  const init: RequestInit = {
    ...rest,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...csrfHeader(),
      ...options.headers,
    },
  };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
  }

  const res = await fetch(`${API_URL}${path}`, init);
  const payload: unknown = await res.json().catch(() => undefined);

  if (!res.ok) {
    const envelope = isErrorEnvelope(payload) ? payload.error : undefined;
    throw new ApiError(envelope?.message ?? `Request to ${path} failed with status ${res.status}`, res.status, envelope?.code);
  }

  return payload as T;
}

/**
 * Multipart upload — deliberately not routed through `rawFetch`, which always sets
 * `Content-Type: application/json` and JSON-encodes the body. A `FormData` body needs the
 * browser to set its own `multipart/form-data; boundary=...` header, so only the CSRF header is
 * set explicitly here (the middleware reads cookies and headers only, never the body, so
 * multipart is unaffected by it).
 */
async function rawUpload<T>(path: string, formData: FormData): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    credentials: 'include',
    headers: csrfHeader(),
    body: formData,
  });
  const payload: unknown = await res.json().catch(() => undefined);

  if (!res.ok) {
    const envelope = isErrorEnvelope(payload) ? payload.error : undefined;
    throw new ApiError(envelope?.message ?? `Upload to ${path} failed with status ${res.status}`, res.status, envelope?.code);
  }

  return payload as T;
}

type SessionExpiredListener = () => void;
const sessionExpiredListeners = new Set<SessionExpiredListener>();

/**
 * Lets the session context (built on top of this module, never imported by it — avoids a
 * circular dependency) learn when the interceptor itself concluded the session is gone, so it
 * can clear local state and route to sign-in without every call site re-deriving that decision.
 */
export function onSessionExpired(listener: SessionExpiredListener): () => void {
  sessionExpiredListeners.add(listener);
  return () => sessionExpiredListeners.delete(listener);
}

function notifySessionExpired(): void {
  for (const listener of sessionExpiredListeners) listener();
}

/**
 * At most one in-flight `/auth/refresh` call, ever, shared by every request that discovers a
 * `forbidden` 403 at roughly the same time. Single-flight here is load-bearing, not an
 * optimization: the server cannot tell a raced second presentation of a refresh credential from
 * theft and revokes the entire session lineage for either
 * (specs/authentication/spec.md - "A second presentation is treated as reuse regardless of
 * intent"). Resolves to whether the refresh itself succeeded — never throws.
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
 * At most one in-flight `GET /auth/csrf` call, shared the same way refresh is — lower stakes
 * (a duplicated call just re-issues the same cookie twice) but the same stampede-avoidance
 * shape (design.md - "Bootstrap is single-flight for stampede avoidance, not for the
 * destructive reason refresh is"). The endpoint always answers 204, so failures here are only
 * ever a network error; either way the caller proceeds to retry once.
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

/** A session-authoritative question only a real session can answer — used to disambiguate a
 *  still-403 retry into "permission denied" (probe succeeds) vs "session gone" (probe fails)
 *  (specs/admin-session/spec.md - "A 403 after refresh is resolved by re-probing, never
 *  assumed"). Deliberately `rawFetch`, not `apiFetch` — this must never itself re-enter
 *  recovery. */
function probeSession(): Promise<boolean> {
  return rawFetch('/users/me').then(
    () => true,
    () => false,
  );
}

/**
 * The 403-recovery algorithm shared by `apiFetch` and `apiUpload`: branch on the error `code`
 * before choosing a path, retry at most once total across both paths combined, and never chain
 * one recovery into the other (design.md - "Bounded composition"). `perform` is re-invoked
 * verbatim on retry — it captures whatever request-specific state (path, body, form data) the
 * caller already closed over.
 */
async function withRecovery<T>(perform: () => Promise<T>, opts: { isSignIn?: boolean }, alreadyRetried = false): Promise<T> {
  try {
    return await perform();
  } catch (err) {
    if (!(err instanceof ApiError) || err.status !== 403 || alreadyRetried) {
      throw err;
    }

    if (err.code === 'csrf_failed') {
      // Recovers the sign-in screen's own submission too — that is exactly the locked-out
      // state this mechanism exists to close (specs/admin-session/spec.md - "Sign-in recovers
      // from a stale CSRF cookie the same way").
      await bootstrapCsrfCookie();
      return withRecovery(perform, opts, true);
    }

    if (err.code === 'forbidden' && !opts.isSignIn) {
      const refreshed = await refreshSession();
      if (!refreshed) {
        notifySessionExpired();
        throw err;
      }
      try {
        return await withRecovery(perform, opts, true);
      } catch (retryErr) {
        if (retryErr instanceof ApiError && retryErr.status === 403) {
          const hasSession = await probeSession();
          if (!hasSession) notifySessionExpired();
        }
        throw retryErr;
      }
    }

    throw err;
  }
}

/** Typed fetch wrapper; always sends the session cookie, never a bearer token. */
export function apiFetch<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  return withRecovery(() => rawFetch<T>(path, options), options.isSignIn ? { isSignIn: true } : {});
}

export function apiUpload<T>(path: string, formData: FormData): Promise<T> {
  return withRecovery(() => rawUpload<T>(path, formData), {});
}
