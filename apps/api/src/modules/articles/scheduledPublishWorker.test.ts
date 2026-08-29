import { beforeEach, describe, expect, it, vi } from 'vitest';

const revalidateArticlePathsMock = vi.fn().mockResolvedValue(undefined);
vi.mock('../../lib/revalidate.js', () => ({
  revalidateArticlePaths: (...args: unknown[]) => revalidateArticlePathsMock(...args),
}));

import { createScheduledPublishJob } from './scheduledPublishWorker.js';
import type { ArticleRepository } from './article.repository.js';

const env = { DEPLOY_TRIGGER_URL: 'https://ci.example.com/dispatch', DEPLOY_TRIGGER_TOKEN: 'x'.repeat(16) };
const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as never;

describe('scheduledPublishJob', () => {
  beforeEach(() => {
    revalidateArticlePathsMock.mockClear();
  });

  it('promotes every due-scheduled article to published, preserving its scheduled published_at', async () => {
    const scheduledTime = new Date(Date.now() - 1000);
    const due = [{ id: 'a1', slug: 'article-one', publishedAt: scheduledTime }];
    const promoteScheduledMock = vi.fn().mockResolvedValue(true);
    const repository = {
      findDueScheduled: vi.fn().mockResolvedValue(due),
      promoteScheduled: promoteScheduledMock,
    } as unknown as ArticleRepository;

    const job = createScheduledPublishJob(repository, env, logger);
    await job();

    // Promotion is guarded by the batch's `now`, and `published_at` is never passed as a value
    // to write — the scheduled time survives (specs/article-management/spec.md - "Worker
    // promotion preserves the scheduled time").
    expect(promoteScheduledMock).toHaveBeenCalledWith('a1', expect.any(Date));
  });

  it('revalidates the promoted article’s paths', async () => {
    const scheduledTime = new Date(Date.now() - 1000);
    const repository = {
      findDueScheduled: vi.fn().mockResolvedValue([{ id: 'a1', slug: 'article-one', publishedAt: scheduledTime }]),
      promoteScheduled: vi.fn().mockResolvedValue(true),
    } as unknown as ArticleRepository;

    const job = createScheduledPublishJob(repository, env, logger);
    await job();

    expect(revalidateArticlePathsMock).toHaveBeenCalledWith(env, logger, 'article-one');
  });

  it('does nothing when no article is due', async () => {
    const repository = {
      findDueScheduled: vi.fn().mockResolvedValue([]),
      promoteScheduled: vi.fn(),
    } as unknown as ArticleRepository;

    const job = createScheduledPublishJob(repository, env, logger);
    await job();

    expect(repository.promoteScheduled).not.toHaveBeenCalled();
    expect(revalidateArticlePathsMock).not.toHaveBeenCalled();
  });

  it('promotes multiple due articles independently', async () => {
    const t1 = new Date(Date.now() - 2000);
    const t2 = new Date(Date.now() - 1000);
    const promoteScheduledMock = vi.fn().mockResolvedValue(true);
    const repository = {
      findDueScheduled: vi.fn().mockResolvedValue([
        { id: 'a1', slug: 'one', publishedAt: t1 },
        { id: 'a2', slug: 'two', publishedAt: t2 },
      ]),
      promoteScheduled: promoteScheduledMock,
    } as unknown as ArticleRepository;

    const job = createScheduledPublishJob(repository, env, logger);
    await job();

    expect(promoteScheduledMock).toHaveBeenCalledTimes(2);
    expect(promoteScheduledMock).toHaveBeenCalledWith('a1', expect.any(Date));
    expect(promoteScheduledMock).toHaveBeenCalledWith('a2', expect.any(Date));
  });

  it('does not revalidate an article that was rescheduled out from under the batch', async () => {
    // The compare-and-set lost: the row is no longer `scheduled` at the timestamp the batch
    // read, so it was rescheduled, unpublished or deleted in the meantime. Revalidating here
    // would publish a view of a state the worker did not actually create.
    const repository = {
      findDueScheduled: vi.fn().mockResolvedValue([{ id: 'a1', slug: 'one', publishedAt: new Date(Date.now() - 1000) }]),
      promoteScheduled: vi.fn().mockResolvedValue(false),
    } as unknown as ArticleRepository;

    const job = createScheduledPublishJob(repository, env, logger);
    await job();

    expect(revalidateArticlePathsMock).not.toHaveBeenCalled();
  });

  it('keeps promoting the rest of the batch when one article fails', async () => {
    const promoteScheduled = vi
      .fn()
      .mockRejectedValueOnce(new Error('transient database failure'))
      .mockResolvedValueOnce(true);
    const repository = {
      findDueScheduled: vi.fn().mockResolvedValue([
        { id: 'a1', slug: 'one', publishedAt: new Date(Date.now() - 2000) },
        { id: 'a2', slug: 'two', publishedAt: new Date(Date.now() - 1000) },
      ]),
      promoteScheduled,
    } as unknown as ArticleRepository;

    const job = createScheduledPublishJob(repository, env, logger);
    await expect(job()).resolves.toBeUndefined();

    expect(promoteScheduled).toHaveBeenCalledTimes(2);
    expect(revalidateArticlePathsMock).toHaveBeenCalledTimes(1);
    expect(revalidateArticlePathsMock).toHaveBeenCalledWith(env, logger, 'two');
  });
});
