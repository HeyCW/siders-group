import { describe, expect, it, vi } from 'vitest';

const revalidateHomePathMock = vi.fn().mockResolvedValue(undefined);
vi.mock('../../lib/revalidate.js', () => ({
  revalidateHomePath: (...args: unknown[]) => revalidateHomePathMock(...args),
}));

import { createReelService } from './reel.service.js';
import type { ReelRepository, ReelRow } from './reel.repository.js';
import type { Logger } from '../../lib/logger.js';

function row(overrides: Partial<ReelRow> & Pick<ReelRow, 'id'>): ReelRow {
  return {
    provider: 'instagram',
    externalId: 'AbC-123x',
    posterMediaId: '11111111-1111-1111-1111-000000000001',
    posterStoragePath: '2026/08/poster.webp',
    caption: null,
    status: 'draft',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

function createFakeReelRepository(initial: ReelRow[] = []) {
  let stored = [...initial];
  const repository: ReelRepository = {
    async create(input) {
      const created = row({ id: `generated-${stored.length}`, ...input });
      stored.push(created);
      return created;
    },
    async findById(id) {
      return stored.find((r) => r.id === id) ?? null;
    },
    async list() {
      return stored;
    },
    async update(id, input) {
      const existing = stored.find((r) => r.id === id);
      if (!existing) throw new Error('not found');
      const updated: ReelRow = {
        ...existing,
        posterMediaId: input.posterMediaId ?? existing.posterMediaId,
        caption: input.caption === undefined ? existing.caption : input.caption,
        status: input.status ?? existing.status,
        updatedAt: new Date(),
      };
      stored = stored.map((r) => (r.id === id ? updated : r));
      return updated;
    },
    async delete(id) {
      stored = stored.filter((r) => r.id !== id);
    },
    async findManyByIds(ids) {
      return stored.filter((r) => ids.includes(r.id));
    },
  };
  return { repository, setStored: (rows: ReelRow[]) => (stored = rows) };
}

const revalidateEnv = { APP_ORIGIN: 'https://example.com', REVALIDATE_SECRET: 'x'.repeat(16) };
const logger = { warn: vi.fn(), error: vi.fn(), info: vi.fn(), fatal: vi.fn() } as unknown as Logger;

describe('ReelService.create', () => {
  it('persists only the parsed provider and externalId, never the submitted URL', async () => {
    const { repository } = createFakeReelRepository();
    const service = createReelService(repository, revalidateEnv, logger);

    const created = await service.create({
      url: 'https://www.instagram.com/reel/AbC-123x/?igsh=tracking',
      posterMediaId: '11111111-1111-1111-1111-000000000001',
      caption: null,
    });

    expect(created.provider).toBe('instagram');
    expect(created.externalId).toBe('AbC-123x');
    expect(created).not.toHaveProperty('url');
  });

  it('rejects a URL that matches no recognized provider', async () => {
    const { repository } = createFakeReelRepository();
    const service = createReelService(repository, revalidateEnv, logger);

    await expect(
      service.create({ url: 'https://example.com/video/1', posterMediaId: '11111111-1111-1111-1111-000000000001', caption: null }),
    ).rejects.toMatchObject({ code: 'invalid_reel_url' });
  });
});

describe('ReelService revalidation', () => {
  it('revalidates "/" when an update crosses the publicly-visible boundary', async () => {
    revalidateHomePathMock.mockClear();
    const { repository } = createFakeReelRepository([row({ id: 'a', status: 'draft' })]);
    const service = createReelService(repository, revalidateEnv, logger);

    await service.update('a', { status: 'published' });

    expect(revalidateHomePathMock).toHaveBeenCalledTimes(1);
  });

  it('does not revalidate when an update does not cross the visibility boundary', async () => {
    revalidateHomePathMock.mockClear();
    const { repository } = createFakeReelRepository([row({ id: 'a', status: 'draft' })]);
    const service = createReelService(repository, revalidateEnv, logger);

    await service.update('a', { caption: 'new caption' });

    expect(revalidateHomePathMock).not.toHaveBeenCalled();
  });

  it('revalidates "/" when a published reel is deleted', async () => {
    revalidateHomePathMock.mockClear();
    const { repository } = createFakeReelRepository([row({ id: 'a', status: 'published' })]);
    const service = createReelService(repository, revalidateEnv, logger);

    await service.delete('a');

    expect(revalidateHomePathMock).toHaveBeenCalledTimes(1);
  });

  it('does not revalidate when a draft reel is deleted', async () => {
    revalidateHomePathMock.mockClear();
    const { repository } = createFakeReelRepository([row({ id: 'a', status: 'draft' })]);
    const service = createReelService(repository, revalidateEnv, logger);

    await service.delete('a');

    expect(revalidateHomePathMock).not.toHaveBeenCalled();
  });
});
