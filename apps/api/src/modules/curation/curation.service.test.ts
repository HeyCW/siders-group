import { describe, expect, it, vi } from 'vitest';

const revalidateHomePathMock = vi.fn().mockResolvedValue(undefined);
vi.mock('../../lib/revalidate.js', () => ({
  revalidateHomePath: (...args: unknown[]) => revalidateHomePathMock(...args),
}));

import { createHomeCurationService } from './curation.service.js';
import type { HomeCurationEntryRow, HomeCurationRepository } from './curation.repository.js';
import type { Logger } from '../../lib/logger.js';

function row(overrides: Partial<HomeCurationEntryRow> & Pick<HomeCurationEntryRow, 'articleId' | 'position'>): HomeCurationEntryRow {
  return { title: 'Untitled', slug: 'untitled', status: 'published', publishedAt: new Date('2026-01-01T00:00:00Z'), ...overrides };
}

function createFakeCurationRepository() {
  let stored: HomeCurationEntryRow[] = [];
  const repository: HomeCurationRepository = {
    async list() {
      return stored;
    },
    async replace(articleIds) {
      // Mirrors the real repository's contract: derive position from array order, and only
      // accept ids present in the fixture's known-article set.
      stored = articleIds.map((articleId, position) => {
        const existing = stored.find((r) => r.articleId === articleId);
        return existing ? { ...existing, position } : row({ articleId, position, title: `Article ${articleId}`, slug: articleId });
      });
      return stored;
    },
  };
  return { repository, setStored: (rows: HomeCurationEntryRow[]) => (stored = rows) };
}

const revalidateEnv = { APP_ORIGIN: 'https://example.com', REVALIDATE_SECRET: 'x'.repeat(16) };
const logger = { warn: vi.fn(), error: vi.fn(), info: vi.fn(), fatal: vi.fn() } as unknown as Logger;

describe('HomeCurationService', () => {
  it('replace overwrites the previous list entirely, in submitted order', async () => {
    const { repository, setStored } = createFakeCurationRepository();
    setStored([row({ articleId: 'a', position: 0 }), row({ articleId: 'b', position: 1 })]);
    const service = createHomeCurationService(repository, revalidateEnv, logger);

    const result = await service.replace(['c', 'a']);

    expect(result.map((e) => e.article.id)).toEqual(['c', 'a']);
    expect(result.map((e) => e.position)).toEqual([0, 1]);
    // 'b' was not resubmitted, so it no longer appears.
    expect(result.some((e) => e.article.id === 'b')).toBe(false);
  });

  it('an empty submission clears the list', async () => {
    const { repository, setStored } = createFakeCurationRepository();
    setStored([row({ articleId: 'a', position: 0 })]);
    const service = createHomeCurationService(repository, revalidateEnv, logger);

    const result = await service.replace([]);

    expect(result).toEqual([]);
    expect(await repository.list()).toEqual([]);
  });

  it('revalidates "/" on every replace', async () => {
    revalidateHomePathMock.mockClear();
    const { repository } = createFakeCurationRepository();
    const service = createHomeCurationService(repository, revalidateEnv, logger);

    await service.replace(['a']);

    expect(revalidateHomePathMock).toHaveBeenCalledTimes(1);
  });

  it('list reports a draft entry as not publicly visible', async () => {
    const { repository, setStored } = createFakeCurationRepository();
    setStored([row({ articleId: 'a', position: 0, status: 'draft', publishedAt: null })]);
    const service = createHomeCurationService(repository, revalidateEnv, logger);

    const [entry] = await service.list();

    expect(entry?.isPubliclyVisible).toBe(false);
  });
});
