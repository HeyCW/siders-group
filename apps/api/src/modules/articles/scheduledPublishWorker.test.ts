import { beforeEach, describe, expect, it, vi } from 'vitest';

const revalidateArticlePathsMock = vi.fn().mockResolvedValue(undefined);
vi.mock('../../lib/revalidate.js', () => ({
  revalidateArticlePaths: (...args: unknown[]) => revalidateArticlePathsMock(...args),
}));

import { createScheduledPublishJob } from './scheduledPublishWorker.js';
import type { ArticleRepository } from './article.repository.js';

const env = { APP_ORIGIN: 'https://example.com', REVALIDATE_SECRET: 'x'.repeat(16) };
const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as never;

describe('scheduledPublishJob', () => {
  beforeEach(() => {
    revalidateArticlePathsMock.mockClear();
  });

  it('promotes every due-scheduled article to published, preserving its scheduled published_at', async () => {
    const scheduledTime = new Date(Date.now() - 1000);
    const due = [{ id: 'a1', slug: 'article-one', publishedAt: scheduledTime }];
    const updateStatusMock = vi.fn().mockResolvedValue({});
    const repository = {
      findDueScheduled: vi.fn().mockResolvedValue(due),
      updateStatus: updateStatusMock,
    } as unknown as ArticleRepository;

    const job = createScheduledPublishJob(repository, env, logger);
    await job();

    expect(updateStatusMock).toHaveBeenCalledWith('a1', 'published', scheduledTime);
  });

  it('revalidates the promoted article’s paths', async () => {
    const scheduledTime = new Date(Date.now() - 1000);
    const repository = {
      findDueScheduled: vi.fn().mockResolvedValue([{ id: 'a1', slug: 'article-one', publishedAt: scheduledTime }]),
      updateStatus: vi.fn().mockResolvedValue({}),
    } as unknown as ArticleRepository;

    const job = createScheduledPublishJob(repository, env, logger);
    await job();

    expect(revalidateArticlePathsMock).toHaveBeenCalledWith(env, logger, 'article-one');
  });

  it('does nothing when no article is due', async () => {
    const repository = {
      findDueScheduled: vi.fn().mockResolvedValue([]),
      updateStatus: vi.fn(),
    } as unknown as ArticleRepository;

    const job = createScheduledPublishJob(repository, env, logger);
    await job();

    expect(repository.updateStatus).not.toHaveBeenCalled();
    expect(revalidateArticlePathsMock).not.toHaveBeenCalled();
  });

  it('promotes multiple due articles independently', async () => {
    const t1 = new Date(Date.now() - 2000);
    const t2 = new Date(Date.now() - 1000);
    const updateStatusMock = vi.fn().mockResolvedValue({});
    const repository = {
      findDueScheduled: vi.fn().mockResolvedValue([
        { id: 'a1', slug: 'one', publishedAt: t1 },
        { id: 'a2', slug: 'two', publishedAt: t2 },
      ]),
      updateStatus: updateStatusMock,
    } as unknown as ArticleRepository;

    const job = createScheduledPublishJob(repository, env, logger);
    await job();

    expect(updateStatusMock).toHaveBeenCalledTimes(2);
    expect(updateStatusMock).toHaveBeenCalledWith('a1', 'published', t1);
    expect(updateStatusMock).toHaveBeenCalledWith('a2', 'published', t2);
  });
});
