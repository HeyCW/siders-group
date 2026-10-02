import { afterEach, describe, expect, it, vi } from 'vitest';
import { articlesApi } from './articlesApi.js';
import { apiFetch } from './api.js';

vi.mock('./api.js', () => ({ apiFetch: vi.fn() }));

afterEach(() => vi.clearAllMocks());

const rows = (n: number, offset = 0) => Array.from({ length: n }, (_, i) => ({ id: `a${offset + i}` }));

describe('articlesApi.list', () => {
  it('walks every page until meta.total is reached', async () => {
    vi.mocked(apiFetch)
      .mockResolvedValueOnce({ success: true, data: rows(100), meta: { total: 130 } })
      .mockResolvedValueOnce({ success: true, data: rows(30, 100), meta: { total: 130 } });

    const result = await articlesApi.list();

    expect(result).toHaveLength(130);
    expect(apiFetch).toHaveBeenCalledTimes(2);
    expect(vi.mocked(apiFetch).mock.calls[1]?.[0]).toContain('page=2');
  });

  it('stops after one request when everything fits on the first page', async () => {
    vi.mocked(apiFetch).mockResolvedValueOnce({ success: true, data: rows(3), meta: { total: 3 } });

    expect(await articlesApi.list()).toHaveLength(3);
    expect(apiFetch).toHaveBeenCalledTimes(1);
  });

  it('forwards the status filter', async () => {
    vi.mocked(apiFetch).mockResolvedValueOnce({ success: true, data: [], meta: { total: 0 } });

    await articlesApi.list('draft');

    expect(vi.mocked(apiFetch).mock.calls[0]?.[0]).toContain('status=draft');
  });
});
