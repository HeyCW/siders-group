import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { revalidateArticlePaths, revalidateHomePath } from './revalidate.js';
import { createLogger } from './logger.js';

const env = { APP_ORIGIN: 'https://example.com', REVALIDATE_SECRET: 'b'.repeat(16) };
const logger = createLogger({ LOG_LEVEL: 'silent' as never, NODE_ENV: 'test' });

describe('revalidateArticlePaths', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('calls the revalidate endpoint once per affected path: detail, listing, and homepage', async () => {
    await revalidateArticlePaths(env, logger, 'my-article');
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const calledPaths = fetchMock.mock.calls.map(([, init]) => JSON.parse((init as RequestInit).body as string).path);
    expect(calledPaths.sort()).toEqual(['/', '/news', '/news/my-article'].sort());
  });

  it('sends the shared secret header on every call', async () => {
    await revalidateArticlePaths(env, logger, 'x');
    for (const [, init] of fetchMock.mock.calls) {
      const headers = (init as RequestInit).headers as Record<string, string>;
      expect(headers['x-revalidate-secret']).toBe(env.REVALIDATE_SECRET);
    }
  });

  it('does not throw when the revalidate endpoint is unreachable', async () => {
    fetchMock.mockRejectedValue(new Error('network down'));
    await expect(revalidateArticlePaths(env, logger, 'x')).resolves.toBeUndefined();
  });

  it('does not throw when the revalidate endpoint responds with an error status', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500 });
    await expect(revalidateArticlePaths(env, logger, 'x')).resolves.toBeUndefined();
  });
});

describe('revalidateHomePath', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('calls the revalidate endpoint exactly once, for "/" only', async () => {
    // specs/home-curation/spec.md - "Curation writes revalidate the homepage": no article's own
    // page changed and /news does not show curation, so unlike revalidateArticlePaths this never
    // touches /news or a /news/<slug> path.
    await revalidateHomePath(env, logger);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string).path).toBe('/');
  });

  it('does not throw when the revalidate endpoint is unreachable', async () => {
    fetchMock.mockRejectedValue(new Error('network down'));
    await expect(revalidateHomePath(env, logger)).resolves.toBeUndefined();
  });

  it('does not throw when the revalidate endpoint responds with an error status', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500 });
    await expect(revalidateHomePath(env, logger)).resolves.toBeUndefined();
  });
});
