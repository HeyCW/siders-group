import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiFetch, apiUpload } from './api.js';

function setCsrfCookie(value: string | null): void {
  Object.defineProperty(document, 'cookie', {
    configurable: true,
    get: () => (value === null ? '' : `some_other=1; csrf_token=${value}; another=2`),
  });
}

describe('apiFetch', () => {
  beforeEach(() => {
    setCsrfCookie(null);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends credentials and parses JSON on success', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'ok' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await apiFetch<{ status: string }>('/health');

    expect(result.status).toBe('ok');
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/health'),
      expect.objectContaining({ credentials: 'include' }),
    );
  });

  it('throws on a non-ok response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) }),
    );

    await expect(apiFetch('/broken')).rejects.toThrow(/500/);
  });

  it('exposes the server error code and status on the thrown ApiError', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 409,
        json: async () => ({ success: false, error: { code: 'slug_conflict', message: 'Taken' } }),
      }),
    );

    await expect(apiFetch('/x')).rejects.toMatchObject({ status: 409, code: 'slug_conflict', message: 'Taken' });
  });
});

/**
 * The API rejects every state-changing request that carries a session cookie without a matching
 * `x-csrf-token` header. Omitting it broke every write the admin app makes — autosave, publish,
 * delete, taxonomy CRUD, image upload — with `403 csrf_failed`, and nothing caught it: unit
 * tests mocked `fetch`, and the browser testing used a mock API that never enforced CSRF.
 */
describe('CSRF double-submit header', () => {
  beforeEach(() => {
    setCsrfCookie(null);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('echoes the csrf_token cookie back as x-csrf-token on apiFetch', async () => {
    setCsrfCookie('token-abc123');
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    vi.stubGlobal('fetch', fetchMock);

    await apiFetch('/admin/articles', { method: 'POST', body: { title: 'x' } });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)['x-csrf-token']).toBe('token-abc123');
  });

  it('echoes the csrf_token cookie back as x-csrf-token on apiUpload', async () => {
    setCsrfCookie('token-xyz789');
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    vi.stubGlobal('fetch', fetchMock);

    await apiUpload('/media', new FormData());

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)['x-csrf-token']).toBe('token-xyz789');
  });

  it('does not set a Content-Type on apiUpload, so the browser can add the multipart boundary', async () => {
    setCsrfCookie('token-abc123');
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    vi.stubGlobal('fetch', fetchMock);

    await apiUpload('/media', new FormData());

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)['Content-Type']).toBeUndefined();
  });

  it('picks the csrf_token cookie out from among other cookies, not a prefix match', async () => {
    setCsrfCookie('exact-value');
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    vi.stubGlobal('fetch', fetchMock);

    await apiFetch('/x', { method: 'POST' });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)['x-csrf-token']).toBe('exact-value');
  });

  it('omits the header entirely when no csrf_token cookie is present', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    vi.stubGlobal('fetch', fetchMock);

    await apiFetch('/x', { method: 'POST' });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)['x-csrf-token']).toBeUndefined();
  });
});
