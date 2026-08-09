import type { ArticleRepository } from './article.repository.js';
import { revalidateArticlePaths, type RevalidateEnv } from '../../lib/revalidate.js';
import type { Logger } from '../../lib/logger.js';

/**
 * Promotes every `scheduled` article whose `published_at` has passed to `published`, leaving
 * `published_at` unchanged — the scheduled time was already correct, this only flips the
 * stored status (design.md - "Scheduling: status flag plus a lazy read-time fallback").
 * Correctness does not depend on this ever running: `article.repository.ts`'s
 * `publiclyVisible()` predicate already treats a due-but-unflipped `scheduled` article as
 * published on every public read. This worker exists only to drive revalidation latency down
 * (specs/article-management/spec.md - "Worker promotion preserves the scheduled time").
 */
export function createScheduledPublishJob(repository: ArticleRepository, env: RevalidateEnv, logger: Logger) {
  return async function scheduledPublishJob(): Promise<void> {
    const due = await repository.findDueScheduled(new Date());
    for (const article of due) {
      await repository.updateStatus(article.id, 'published', article.publishedAt);
      await revalidateArticlePaths(env, logger, article.slug);
      logger.info({ articleId: article.id, slug: article.slug }, 'scheduled article promoted to published');
    }
  };
}
