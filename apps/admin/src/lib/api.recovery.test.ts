import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, apiFetch, apiUpload, onSessionExpired, onSessionShouldReresolve } from './api.js';

function setCsrfCookie(value: string | null): void {
  Object.defineProperty(document, 'cookie', {
    configurable: true,
    get: () => (value === null ? '' : `csrf_token=${value}`),
  });
}

interface QueuedResponse {
  status: number;
  body?: unknown;
}

function forbidden(): QueuedResponse {
  return { status: 403, body: { success: false, error: { code: 'forbidden', message: 'Staff session required' } } };
}
function csrfFailed(): QueuedResponse {
  return { status: 403, body: { success: false, error: { code: 'csrf_failed', message: 'CSRF token missing or invalid' } } };
}
function ok(body: unknown = { success: true, data: {} }): QueuedResponse {
  return { status: 200, body };
}
function noContent(): QueuedResponse {
  return { status: 204, body: undefined };
}
function unauthorized(): QueuedResponse {
  return { status: 401, body: { success: false, error: { code: 'invalid_refresh_token', message: 'Invalid refresh token' } } };
}
function passwordChangeRequired(): QueuedResponse {
  return {
    status: 403,
    body: { success: false, error: { code: 'password_change_required', message: 'Password change required' } },
  };
}

/** Routes the stubbed `fetch` by URL suffix, queuing responses per endpoint and counting calls
 *  — everything the single-flight / retry-once assertions below need. */
function createFetchRouter() {
  const queues = new Map<string, QueuedResponse[]>();
  const callCounts = new Map<string, number>();

  function on(pathSuffix: string, ...responses: QueuedResponse[]): void {
    queues.set(pathSuffix, [...responses]);
  }
  function calls(pathSuffix: string): number {
    return callCounts.get(pathSuffix) ?? 0;
  }
  const fetchMock = vi.fn(async (url: string) => {
    const suffix = [...queues.keys()].find((k) => url.includes(k));
    if (!suffix) throw new Error(`Unhandled fetch to ${url}`);
    callCounts.set(suffix, (callCounts.get(suffix) ?? 0) + 1);
    const queue = queues.get(suffix) as QueuedResponse[];
    const next = (queue.length > 1 ? queue.shift() : queue[0]) as QueuedResponse;
    return { ok: next.status >= 200 && next.status < 300, status: next.status, json: async () => next.body };
  });
  return { on, calls, fetchMock };
}

describe('apiFetch/apiUpload recovery interceptor', () => {
  let unsubscribers: Array<() => void> = [];

  beforeEach(() => {
    setCsrfCookie('token');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    unsubscribers.forEach((unsub) => unsub());
    unsubscribers = [];
  });

  function trackSessionExpired(): { count: () => number } {
    let count = 0;
    unsubscribers.push(onSessionExpired(() => (count += 1)));
    return { count: () => count };
  }

  function trackSessionShouldReresolve(): { count: () => number } {
    let count = 0;
    unsubscribers.push(onSessionShouldReresolve(() => (count += 1)));
    return { count: () => count };
  }

  it('a single forbidden 403 triggers exactly one refresh and one retry', async () => {
    const router = createFetchRouter();
    router.on('/feature', forbidden(), ok());
    router.on('/auth/refresh', noContent());
    vi.stubGlobal('fetch', router.fetchMock);

    const result = await apiFetch('/feature');

    expect(result).toEqual({ success: true, data: {} });
    expect(router.calls('/feature')).toBe(2);
    expect(router.calls('/auth/refresh')).toBe(1);
  });

  it('concurrent forbidden 403s share exactly one refresh attempt', async () => {
    const router = createFetchRouter();
    router.on('/feature', forbidden(), forbidden(), forbidden(), ok());
    router.on('/auth/refresh', noContent());
    vi.stubGlobal('fetch', router.fetchMock);

    const results = await Promise.all([apiFetch('/feature'), apiFetch('/feature'), apiFetch('/feature')]);

    expect(results).toEqual([{ success: true, data: {} }, { success: true, data: {} }, { success: true, data: {} }]);
    expect(router.calls('/auth/refresh')).toBe(1);
  });

  it('concurrent csrf_failed 403s share exactly one bootstrap attempt', async () => {
    const router = createFetchRouter();
    router.on('/feature', csrfFailed(), csrfFailed(), csrfFailed(), ok());
    router.on('/auth/csrf', noContent());
    vi.stubGlobal('fetch', router.fetchMock);

    await Promise.all([apiFetch('/feature'), apiFetch('/feature'), apiFetch('/feature')]);

    expect(router.calls('/auth/csrf')).toBe(1);
  });

  it('a mix of forbidden and csrf_failed rejections produces exactly one refresh and one bootstrap call', async () => {
    const router = createFetchRouter();
    router.on('/feature-a', forbidden(), ok());
    router.on('/feature-b', csrfFailed(), ok());
    router.on('/auth/refresh', noContent());
    router.on('/auth/csrf', noContent());
    vi.stubGlobal('fetch', router.fetchMock);

    await Promise.all([apiFetch('/feature-a'), apiFetch('/feature-a'), apiFetch('/feature-b'), apiFetch('/feature-b')]);

    expect(router.calls('/auth/refresh')).toBe(1);
    expect(router.calls('/auth/csrf')).toBe(1);
  });

  it('a request is not retried a second time after already being retried once', async () => {
    const router = createFetchRouter();
    router.on('/feature', forbidden(), forbidden());
    router.on('/auth/refresh', noContent());
    router.on('/users/me', ok());
    vi.stubGlobal('fetch', router.fetchMock);

    await expect(apiFetch('/feature')).rejects.toMatchObject({ status: 403, code: 'forbidden' });
    // Exactly one retry of the original request: 2 total calls (original + one retry).
    expect(router.calls('/feature')).toBe(2);
    expect(router.calls('/auth/refresh')).toBe(1);
  });

  it('a failed refresh ends the session locally without retrying the original request', async () => {
    const router = createFetchRouter();
    router.on('/feature', forbidden());
    router.on('/auth/refresh', unauthorized());
    vi.stubGlobal('fetch', router.fetchMock);
    const expired = trackSessionExpired();

    await expect(apiFetch('/feature')).rejects.toMatchObject({ status: 403, code: 'forbidden' });

    expect(router.calls('/feature')).toBe(1); // never retried
    expect(expired.count()).toBe(1);
  });

  it('a retry that still 403s after a successful refresh re-probes and treats a successful probe as permission denial', async () => {
    const router = createFetchRouter();
    router.on('/feature', forbidden(), forbidden());
    router.on('/auth/refresh', noContent());
    router.on('/users/me', ok());
    vi.stubGlobal('fetch', router.fetchMock);
    const expired = trackSessionExpired();

    await expect(apiFetch('/feature')).rejects.toMatchObject({ status: 403, code: 'forbidden' });

    expect(router.calls('/users/me')).toBe(1);
    expect(expired.count()).toBe(0); // stays signed in — this was a permission denial, not a lost session
  });

  it('a retry that still 403s after a successful refresh re-probes and treats a failed probe as session gone', async () => {
    const router = createFetchRouter();
    router.on('/feature', forbidden(), forbidden());
    router.on('/auth/refresh', noContent());
    router.on('/users/me', forbidden());
    vi.stubGlobal('fetch', router.fetchMock);
    const expired = trackSessionExpired();

    await expect(apiFetch('/feature')).rejects.toMatchObject({ status: 403 });

    expect(expired.count()).toBe(1);
  });

  it('a password_change_required 403 triggers neither refresh nor bootstrap, and notifies the session context to re-resolve', async () => {
    const router = createFetchRouter();
    router.on('/feature', passwordChangeRequired());
    vi.stubGlobal('fetch', router.fetchMock);
    const reresolve = trackSessionShouldReresolve();
    const expired = trackSessionExpired();

    await expect(apiFetch('/feature')).rejects.toMatchObject({ status: 403, code: 'password_change_required' });

    expect(router.calls('/feature')).toBe(1); // never retried
    expect(router.calls('/auth/refresh')).toBe(0);
    expect(router.calls('/auth/csrf')).toBe(0);
    expect(reresolve.count()).toBe(1);
    expect(expired.count()).toBe(0); // the session is still valid — this is not "session gone"
  });

  it('bounded composition: a refresh-recovered retry that fails with csrf_failed does not then attempt a bootstrap', async () => {
    const router = createFetchRouter();
    router.on('/feature', forbidden(), csrfFailed());
    router.on('/auth/refresh', noContent());
    router.on('/users/me', forbidden());
    vi.stubGlobal('fetch', router.fetchMock);

    await expect(apiFetch('/feature')).rejects.toMatchObject({ status: 403, code: 'csrf_failed' });

    expect(router.calls('/auth/csrf')).toBe(0);
  });

  it('a csrf_failed 403 on POST /auth/staff/login triggers bootstrap and one retry, never a refresh', async () => {
    const router = createFetchRouter();
    router.on('/auth/staff/login', csrfFailed(), noContent());
    router.on('/auth/csrf', noContent());
    vi.stubGlobal('fetch', router.fetchMock);

    await apiFetch('/auth/staff/login', { method: 'POST', body: { email: 'a@b.com', password: 'x' }, isSignIn: true });

    expect(router.calls('/auth/csrf')).toBe(1);
    expect(router.calls('/auth/refresh')).toBe(0);
    expect(router.calls('/auth/staff/login')).toBe(2);
  });

  it('a forbidden 403 on the sign-in submission never triggers a refresh', async () => {
    const router = createFetchRouter();
    router.on('/auth/staff/login', forbidden());
    vi.stubGlobal('fetch', router.fetchMock);

    await expect(
      apiFetch('/auth/staff/login', { method: 'POST', body: { email: 'a@b.com', password: 'x' }, isSignIn: true }),
    ).rejects.toMatchObject({ status: 403, code: 'forbidden' });

    expect(router.calls('/auth/refresh')).toBe(0);
    expect(router.calls('/auth/staff/login')).toBe(1); // never retried
  });

  it('apiUpload shares the same recovery interceptor as apiFetch', async () => {
    const router = createFetchRouter();
    router.on('/media', forbidden(), ok());
    router.on('/auth/refresh', noContent());
    vi.stubGlobal('fetch', router.fetchMock);

    const result = await apiUpload('/media', new FormData());

    expect(result).toEqual({ success: true, data: {} });
    expect(router.calls('/auth/refresh')).toBe(1);
  });

  it('non-403 errors pass through unrecovered', async () => {
    const router = createFetchRouter();
    router.on('/feature', { status: 500, body: {} });
    vi.stubGlobal('fetch', router.fetchMock);

    await expect(apiFetch('/feature')).rejects.toBeInstanceOf(ApiError);
    expect(router.calls('/feature')).toBe(1);
  });
});
