import { describe, expect, it } from 'vitest';
import { createPublicReelsService } from './publicReels.service.js';
import type { ReelsCurationEntryRow, ReelsCurationRepository } from './reelsCuration.repository.js';

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

function fakeRepository(entries: ReelsCurationEntryRow[]): ReelsCurationRepository {
  return {
    async list() {
      return entries;
    },
    async replace() {
      throw new Error('not used by the public service');
    },
  };
}

const env = { MEDIA_PUBLIC_BASE_URL: 'https://media.example.com' };

describe('PublicReelsService.getRail', () => {
  it('returns published reels in stored order', async () => {
    const repository = fakeRepository([
      row({ reelId: 'a', position: 0, externalId: 'a-id' }),
      row({ reelId: 'b', position: 1, externalId: 'b-id' }),
    ]);
    const service = createPublicReelsService(repository, env);

    const rail = await service.getRail();

    expect(rail.map((item) => item.externalId)).toEqual(['a-id', 'b-id']);
  });

  it('omits draft and unavailable entries', async () => {
    const repository = fakeRepository([
      row({ reelId: 'a', position: 0, status: 'draft' }),
      row({ reelId: 'b', position: 1, status: 'unavailable' }),
      row({ reelId: 'c', position: 2, status: 'published', externalId: 'c-id' }),
    ]);
    const service = createPublicReelsService(repository, env);

    const rail = await service.getRail();

    expect(rail).toHaveLength(1);
    expect(rail[0]?.externalId).toBe('c-id');
  });

  it('does not backfill a short ordering with unordered reels', async () => {
    const repository = fakeRepository([row({ reelId: 'a', position: 0 })]);
    const service = createPublicReelsService(repository, env);

    const rail = await service.getRail();

    expect(rail).toHaveLength(1);
  });

  it('returns an empty array for an empty ordering, not a fallback rail', async () => {
    const repository = fakeRepository([]);
    const service = createPublicReelsService(repository, env);

    const rail = await service.getRail();

    expect(rail).toEqual([]);
  });

  it('carries no HTML, iframe, or embed markup', async () => {
    const repository = fakeRepository([row({ reelId: 'a', position: 0 })]);
    const service = createPublicReelsService(repository, env);

    const [item] = await service.getRail();

    expect(Object.keys(item ?? {}).sort()).toEqual(['caption', 'externalId', 'posterUrl', 'provider']);
  });
});
