import { revalidateArticlePaths } from '../../lib/revalidate.js';
/**
 * Promotes every `scheduled` article whose `published_at` has passed to `published`, leaving
 * `published_at` unchanged — the scheduled time was already correct, this only flips the
 * stored status (design.md - "Scheduling: status flag plus a lazy read-time fallback").
 * Correctness does not depend on this ever running: `article.repository.ts`'s
 * `publiclyVisible()` predicate already treats a due-but-unflipped `scheduled` article as
 * published on every public read. This worker exists only to drive revalidation latency down
 * (specs/article-management/spec.md - "Worker promotion preserves the scheduled time").
 */
export function createScheduledPublishJob(repository, env, logger) {
    return async function scheduledPublishJob() {
        const now = new Date();
        const due = await repository.findDueScheduled(now);
        for (const article of due) {
            // One article's failure (a transient DB error, a bad row) must not stop the rest of the
            // batch from promoting — correctness never depends on this worker anyway (see the note
            // above), so the right failure mode is "log and keep going," not "abort the run."
            try {
                // Re-checks the due condition inside the UPDATE, so an article rescheduled into the
                // future, unpublished or deleted between this batch's SELECT and now is skipped rather
                // than resurrected — and a skipped article is not revalidated.
                const promoted = await repository.promoteScheduled(article.id, now);
                if (!promoted) {
                    logger.info({ articleId: article.id, slug: article.slug }, 'scheduled article changed before promotion; skipped');
                    continue;
                }
                await revalidateArticlePaths(env, logger, article.slug);
                logger.info({ articleId: article.id, slug: article.slug }, 'scheduled article promoted to published');
            }
            catch (err) {
                logger.error({ err, articleId: article.id, slug: article.slug }, 'failed to promote scheduled article');
            }
        }
    };
}
