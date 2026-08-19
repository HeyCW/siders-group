import { describe, expect, it, vi } from 'vitest';

const revalidateHomePathMock = vi.fn().mockResolvedValue(undefined);
vi.mock('../../lib/revalidate.js', () => ({
  revalidateHomePath: (...args: unknown[]) => revalidateHomePathMock(...args),
}));

import { createReelsCurationService } from './reelsCuration.service.js';
import type { ReelsCurationEntryRow, ReelsCurationRepository } from './reelsCuration.repository.js';
import type { Logger } from '../../lib/logger.js';

function row(overrides: Partial<ReelsCurationEntryRow> & Pick<ReelsCurationEntryRow, 'reelId' | 'position'>): ReelsCurationEntryRow {
  return {
    provider: 'instagram',
    externalId: 'AbC-123x',
    posterStoragePath: '2026/08/poster.webp',
    caption: null,
    status: 'published',
    ...overrides,
  };
}

function createFakeReelsCurationRepository() {
  let stored: ReelsCurationEntryRow[] = [];
  const repository: ReelsCurationRepository = {
    async list() {
      return stored;
    },
    async replace(reelIds) {
      stored = reelIds.map((reelId, position) => {
        const existing = stored.find((r) => r.reelId === reelId);
        return existing ? { ...existing, position } : row({ reelId, position, externalId: reelId });
      });
      return stored;
    },
  };
  return { repository, setStored: (rows: ReelsCurationEntryRow[]) => (stored = rows) };
}

const revalidateEnv = { APP_ORIGIN: 'https://example.com', REVALIDATE_SECRET: 'x'.repeat(16) };
const mediaEnv = { MEDIA_PUBLIC_BASE_URL: 'https://media.example.com' };
const logger = { warn: vi.fn(), error: vi.fn(), info: vi.fn(), fatal: vi.fn() } as unknown as Logger;

describe('ReelsCurationService', () => {
  it('replace overwrites the previous ordering entirely, in submitted order', async () => {
    const { repository, setStored } = createFakeReelsCurationRepository();
    setStored([row({ reelId: 'a', position: 0 }), row({ reelId: 'b', position: 1 })]);
    const service = createReelsCurationService(repository, revalidateEnv, mediaEnv, logger);

    const result = await service.replace(['c', 'a']);

    expect(result.map((e) => e.reel.id)).toEqual(['c', 'a']);
    expect(result.map((e) => e.position)).toEqual([0, 1]);
    expect(result.some((e) => e.reel.id === 'b')).toBe(false);
  });

  it('an empty submission clears the ordering', async () => {
    const { repository, setStored } = createFakeReelsCurationRepository();
    setStored([row({ reelId: 'a', position: 0 })]);
    const service = createReelsCurationService(repository, revalidateEnv, mediaEnv, logger);

    const result = await service.replace([]);

    expect(result).toEqual([]);
    expect(await repository.list()).toEqual([]);
  });

  it('revalidates "/" on every replace', async () => {
    revalidateHomePathMock.mockClear();
    const { repository } = createFakeReelsCurationRepository();
    const service = createReelsCurationService(repository, revalidateEnv, mediaEnv, logger);

    await service.replace(['a']);

    expect(revalidateHomePathMock).toHaveBeenCalledTimes(1);
  });

  it('list reports a draft entry as not publicly visible', async () => {
    const { repository, setStored } = createFakeReelsCurationRepository();
    setStored([row({ reelId: 'a', position: 0, status: 'draft' })]);
    const service = createReelsCurationService(repository, revalidateEnv, mediaEnv, logger);

    const [entry] = await service.list();

    expect(entry?.isPubliclyVisible).toBe(false);
  });

  it('list reports an unavailable entry as not publicly visible', async () => {
    const { repository, setStored } = createFakeReelsCurationRepository();
    setStored([row({ reelId: 'a', position: 0, status: 'unavailable' })]);
    const service = createReelsCurationService(repository, revalidateEnv, mediaEnv, logger);

    const [entry] = await service.list();

    expect(entry?.isPubliclyVisible).toBe(false);
  });

  it('derives posterUrl from the joined storage path, not from a stored URL', async () => {
    const { repository, setStored } = createFakeReelsCurationRepository();
    setStored([row({ reelId: 'a', position: 0, posterStoragePath: '2026/08/x.webp' })]);
    const service = createReelsCurationService(repository, revalidateEnv, mediaEnv, logger);

    const [entry] = await service.list();

    expect(entry?.reel.posterUrl).toBe('https://media.example.com/2026/08/x.webp');
  });

  it('reports posterUrl as null for a reel with no poster, rather than an empty string', async () => {
    const { repository, setStored } = createFakeReelsCurationRepository();
    setStored([row({ reelId: 'a', position: 0, posterStoragePath: null })]);
    const service = createReelsCurationService(repository, revalidateEnv, mediaEnv, logger);

    const [entry] = await service.list();

    expect(entry?.reel.posterUrl).toBeNull();
  });
});
