// `apps/web` is now a static export (next.config.mjs — `output: 'export'`) with no server to
// receive a per-path revalidation POST, so there is no more "revalidate `/news/<slug>`, `/news`,
// and `/` individually" — the only unit of update is a full rebuild-and-redeploy. This triggers
// that rebuild via a generic webhook (a GitHub Actions `repository_dispatch`/`workflow_dispatch`
// endpoint, or any CI system that accepts an authenticated POST to start a job) rather than
// calling GitHub's API directly, so this stays usable if the deploy pipeline changes.
async function triggerRebuild(env, logger) {
    if (!env.DEPLOY_TRIGGER_URL) {
        // Not configured — expected in local dev and any environment that hasn't wired up a deploy
        // pipeline yet, so this stays quiet rather than warning on every content write.
        return;
    }
    try {
        const res = await fetch(env.DEPLOY_TRIGGER_URL, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                ...(env.DEPLOY_TRIGGER_TOKEN ? { authorization: `Bearer ${env.DEPLOY_TRIGGER_TOKEN}` } : {}),
            },
            body: JSON.stringify({ event_type: 'content-published' }),
        });
        if (!res.ok) {
            logger.warn({ status: res.status }, 'rebuild trigger request rejected');
        }
    }
    catch (err) {
        logger.warn({ err }, 'rebuild trigger request failed');
    }
}
/**
 * Called on publish, unpublish, delete, worker promotion, and any update to a currently visible
 * article (specs/article-management/spec.md - "Public pages are revalidated when an article
 * changes"). The specific slugs no longer select which paths get revalidated — every call
 * triggers the same one rebuild — but the parameter stays so call sites that pass the changed
 * slug(s) don't need to change.
 *
 * Fires the webhook on every call rather than debouncing: a burst of writes means a burst of
 * rebuild triggers, and it's the CI/deploy system's job to coalesce or queue those, not this
 * process's. That also keeps the guarantee below simple to state and to test — a failed trigger
 * is swallowed here (`triggerRebuild`'s own try/catch), so a write's caller awaiting this can
 * never fail because a rebuild couldn't be requested.
 */
export async function revalidateArticlePaths(env, logger, ..._slugs) {
    await triggerRebuild(env, logger);
}
/**
 * A curation or partner write changes only the homepage (specs/home-curation/spec.md -
 * "Curation writes revalidate the homepage"). Kept as a separate export for the same reason as
 * above — call-site clarity — even though it now triggers the identical rebuild.
 */
export async function revalidateHomePath(env, logger) {
    await triggerRebuild(env, logger);
}
