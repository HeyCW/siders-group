import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, getCategories } from './api';

function mockFetchOnce(body: unknown, status = 200): void {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('apiFetch (via getCategories)', () => {
  it("returns the envelope's data on success", async () => {
    mockFetchOnce({ success: true, data: [{ id: '1', name: 'Kuliner', slug: 'kuliner' }] });
    await expect(getCategories()).resolves.toEqual([{ id: '1', name: 'Kuliner', slug: 'kuliner' }]);
  });

  it("throws ApiError with the envelope's code and message on a success:false body", async () => {
    mockFetchOnce(
      { success: false, error: { code: 'rate_limited', message: 'Too many requests' } },
      429,
    );
    await expect(getCategories()).rejects.toMatchObject({
      name: 'ApiError',
      status: 429,
      code: 'rate_limited',
      message: 'Too many requests',
    });
  });

  it('falls back to a generic message when the body has no parseable error envelope', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => {
          throw new Error('not json');
        },
      }),
    );
    await expect(getCategories()).rejects.toThrow(ApiError);
  });
});
