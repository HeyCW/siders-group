import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, getReaderAccount, signOutReader, hasCsrfCookie } from './authApi';

const ACCOUNT = {
  id: '11111111-1111-1111-1111-111111111111',
  email: 'reader@example.com',
  name: 'Charles',
  avatarUrl: null,
  status: 'active' as const,
  createdAt: '2026-08-01T00:00:00.000Z',
};

function setCookie(value: string | null): void {
  document.cookie = 'csrf_token=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
  if (value !== null) {
    document.cookie = `csrf_token=${encodeURIComponent(value)}; path=/`;
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
  setCookie(null);
});

describe('hasCsrfCookie', () => {
  it('is false when the cookie is absent', () => {
    setCookie(null);
    expect(hasCsrfCookie()).toBe(false);
  });

  it('is true when the cookie is present', () => {
    setCookie('abc.def.ghi');
    expect(hasCsrfCookie()).toBe(true);
  });
});

describe('getReaderAccount', () => {
  it('returns the account on success with no recovery', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ success: true, data: ACCOUNT }));
    vi.stubGlobal('fetch', fetchMock);
    setCookie('token');

    await expect(getReaderAccount()).resolves.toEqual(ACCOUNT);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('sends the CSRF header echoing the cookie value', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ success: true, data: ACCOUNT }));
    vi.stubGlobal('fetch', fetchMock);
    setCookie('signed-value');

    await getReaderAccount();

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)['x-csrf-token']).toBe('signed-value');
    expect(init.credentials).toBe('include');
  });

  it('refreshes once and retries after a 401, resolving to the account', async () => {
    const fetchMock = vi
      .fn()
      // first /auth/me -> 401
      .mockResolvedValueOnce(
        jsonResponse({ success: false, error: { code: 'unauthenticated', message: 'nope' } }, 401),
      )
      // /auth/refresh -> 204
      .mockResolvedValueOnce(jsonResponse(undefined, 204))
      // retried /auth/me -> 200
      .mockResolvedValueOnce(jsonResponse({ success: true, data: ACCOUNT }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(getReaderAccount()).resolves.toEqual(ACCOUNT);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect((fetchMock.mock.calls[1] as [string, RequestInit])[0]).toContain('/auth/refresh');
  });

  it('rejects with the original error when refresh itself fails, with no retry', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ success: false, error: { code: 'unauthenticated', message: 'nope' } }, 401),
      )
      .mockResolvedValueOnce(
        jsonResponse({ success: false, error: { code: 'invalid_refresh_token', message: 'no' } }, 401),
      );
    vi.stubGlobal('fetch', fetchMock);

    await expect(getReaderAccount()).rejects.toMatchObject({ status: 401, code: 'unauthenticated' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not attempt a second refresh when the retry is rejected again', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ success: false, error: { code: 'unauthenticated', message: 'nope' } }, 401),
      )
      .mockResolvedValueOnce(jsonResponse(undefined, 204))
      .mockResolvedValueOnce(
        jsonResponse({ success: false, error: { code: 'unauthenticated', message: 'nope' } }, 401),
      );
    vi.stubGlobal('fetch', fetchMock);

    await expect(getReaderAccount()).rejects.toMatchObject({ status: 401 });
    // 401 -> refresh -> retry (401, not retried again) = 3 calls, never a second refresh
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('shares exactly one in-flight refresh across concurrent 401s', async () => {
    let refreshCalls = 0;
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/auth/refresh')) {
        refreshCalls += 1;
        return Promise.resolve(jsonResponse(undefined, 204));
      }
      if (url.includes('/auth/me')) {
        // Each call to /auth/me fails once, then succeeds after refresh resolves.
        return Promise.resolve(
          refreshCalls > 0
            ? jsonResponse({ success: true, data: ACCOUNT })
            : jsonResponse({ success: false, error: { code: 'unauthenticated', message: 'nope' } }, 401),
        );
      }
      throw new Error(`unexpected url ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const [a, b] = await Promise.all([getReaderAccount(), getReaderAccount()]);
    expect(a).toEqual(ACCOUNT);
    expect(b).toEqual(ACCOUNT);
    expect(refreshCalls).toBe(1);
  });

  it('re-pairs the CSRF cookie and retries once on a 403 csrf_failed, without refreshing', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ success: false, error: { code: 'csrf_failed', message: 'nope' } }, 403),
      )
      .mockResolvedValueOnce(jsonResponse(undefined, 204)) // /auth/csrf bootstrap
      .mockResolvedValueOnce(jsonResponse({ success: true, data: ACCOUNT }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(getReaderAccount()).resolves.toEqual(ACCOUNT);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect((fetchMock.mock.calls[1] as [string, RequestInit])[0]).toContain('/auth/csrf');
    expect(fetchMock.mock.calls.some((c) => (c[0] as string).includes('/auth/refresh'))).toBe(false);
  });

  it('shares exactly one in-flight re-pairing request across concurrent csrf_failed rejections', async () => {
    let bootstrapCalls = 0;
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/auth/csrf')) {
        bootstrapCalls += 1;
        return Promise.resolve(jsonResponse(undefined, 204));
      }
      if (url.includes('/auth/me')) {
        // Each call to /auth/me fails once with csrf_failed, then succeeds after bootstrap resolves.
        return Promise.resolve(
          bootstrapCalls > 0
            ? jsonResponse({ success: true, data: ACCOUNT })
            : jsonResponse({ success: false, error: { code: 'csrf_failed', message: 'nope' } }, 403),
        );
      }
      throw new Error(`unexpected url ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const [a, b] = await Promise.all([getReaderAccount(), getReaderAccount()]);
    expect(a).toEqual(ACCOUNT);
    expect(b).toEqual(ACCOUNT);
    expect(bootstrapCalls).toBe(1);
  });

  it('does not chain a refresh after a csrf re-pair retry fails again', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ success: false, error: { code: 'csrf_failed', message: 'nope' } }, 403),
      )
      .mockResolvedValueOnce(jsonResponse(undefined, 204))
      .mockResolvedValueOnce(
        jsonResponse({ success: false, error: { code: 'unauthenticated', message: 'nope' } }, 401),
      );
    vi.stubGlobal('fetch', fetchMock);

    await expect(getReaderAccount()).rejects.toMatchObject({ status: 401 });
    // csrf-fail -> bootstrap -> retry (401, already retried, thrown immediately) = 3 calls
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});

describe('signOutReader', () => {
  it('calls the logout endpoint with the CSRF header', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(undefined, 204));
    vi.stubGlobal('fetch', fetchMock);
    setCookie('token');

    await signOutReader();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/auth/logout');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['x-csrf-token']).toBe('token');
  });
});

// Re-exported for completeness of the ApiError contract used across authApi's callers.
describe('ApiError', () => {
  it('carries status and code', () => {
    const err = new ApiError('nope', 401, 'unauthenticated');
    expect(err.status).toBe(401);
    expect(err.code).toBe('unauthenticated');
    expect(err.name).toBe('ApiError');
  });
});
