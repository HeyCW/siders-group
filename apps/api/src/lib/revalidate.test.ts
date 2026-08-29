import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { revalidateArticlePaths, revalidateHomePath } from './revalidate.js';
import { createLogger } from './logger.js';

const env = { DEPLOY_TRIGGER_URL: 'https://ci.example.com/dispatch', DEPLOY_TRIGGER_TOKEN: 'b'.repeat(16) };
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

  it('triggers the deploy webhook with an authenticated POST', async () => {
    await revalidateArticlePaths(env, logger, 'my-article');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(env.DEPLOY_TRIGGER_URL);
    expect((init.headers as Record<string, string>).authorization).toBe(`Bearer ${env.DEPLOY_TRIGGER_TOKEN}`);
  });

  it('does nothing when no deploy trigger is configured', async () => {
    await revalidateArticlePaths({ DEPLOY_TRIGGER_URL: undefined, DEPLOY_TRIGGER_TOKEN: undefined }, logger, 'x');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not throw when the deploy webhook is unreachable', async () => {
    fetchMock.mockRejectedValue(new Error('network down'));
    await expect(revalidateArticlePaths(env, logger, 'x')).resolves.toBeUndefined();
  });

  it('does not throw when the deploy webhook responds with an error status', async () => {
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

  it('triggers the same deploy webhook as an article change', async () => {
    await revalidateHomePath(env, logger);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(env.DEPLOY_TRIGGER_URL);
  });

  it('does not throw when the deploy webhook is unreachable', async () => {
    fetchMock.mockRejectedValue(new Error('network down'));
    await expect(revalidateHomePath(env, logger)).resolves.toBeUndefined();
  });
});
