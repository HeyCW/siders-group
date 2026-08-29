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

// Sanctum's own double-submit pair (not the old Node app's custom `csrf_token`/`x-csrf-token`
// scheme) — `XSRF-TOKEN` is deliberately script-readable (not httpOnly) so this can echo it back.
const CSRF_COOKIE = 'XSRF-TOKEN';
const CSRF_HEADER = 'X-XSRF-TOKEN';

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

  const res = await fetch(`${API_URL}/api${path}`, init);
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
  const res = await fetch(`${API_URL}/api${path}`, {
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

type SessionShouldReresolveListener = () => void;
const sessionShouldReresolveListeners = new Set<SessionShouldReresolveListener>();

/**
 * Lets the session context learn when a `password_change_required` 403 arrived mid-session, so
 * it can re-read the caller's own account and pick up the flag — the session and CSRF pairing
 * are both still valid, so this is distinct from `onSessionExpired` above: nothing is gone, the
 * account's own state just changed (specs/admin-session/spec.md - "A mid-session 403 coded
 * password_change_required routes to the change screen, not to a recovery path").
 */
export function onSessionShouldReresolve(listener: SessionShouldReresolveListener): () => void {
  sessionShouldReresolveListeners.add(listener);
  return () => sessionShouldReresolveListeners.delete(listener);
}

function notifySessionShouldReresolve(): void {
  for (const listener of sessionShouldReresolveListeners) listener();
}

/**
 * At most one in-flight `GET /sanctum/csrf-cookie` call, shared by every request that discovers a
 * stale/missing CSRF cookie at roughly the same time (design.md - "Bootstrap is single-flight for
 * stampede avoidance"). Hits Sanctum's own route directly — deliberately NOT prefixed with `/api`
 * like every other endpoint here, since Sanctum registers it at the application root.
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
 * The recovery algorithm shared by `apiFetch` and `apiUpload`: branch on the error before
 * choosing a path, retry at most once total. There is no refresh-token concept under Sanctum's
 * session-cookie auth (unlike the old Node app's JWT+refresh scheme) — a 401 `unauthenticated`
 * means the session itself is gone, full stop, so it goes straight to `notifySessionExpired`
 * rather than attempting to recover it.
 */
async function withRecovery<T>(perform: () => Promise<T>, opts: { isSignIn?: boolean }, alreadyRetried = false): Promise<T> {
  try {
    return await perform();
  } catch (err) {
    if (!(err instanceof ApiError) || alreadyRetried) {
      throw err;
    }

    // Laravel's TokenMismatchException renders as 419, not 403 — checked by code, not status,
    // in case that ever changes.
    if (err.code === 'csrf_failed') {
      // Recovers the sign-in screen's own submission too — that is exactly the locked-out
      // state this mechanism exists to close (specs/admin-session/spec.md - "Sign-in recovers
      // from a stale CSRF cookie the same way").
      await bootstrapCsrfCookie();
      return withRecovery(perform, opts, true);
    }

    if (err.status === 401 && err.code === 'unauthenticated' && !opts.isSignIn) {
      notifySessionExpired();
      throw err;
    }

    if (err.code === 'password_change_required') {
      // The session and CSRF pairing are both still valid, only the account's own state
      // changed. Re-resolving lets the route guard confine the app to the change screen; the
      // originating call still rejects.
      notifySessionShouldReresolve();
      throw err;
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
