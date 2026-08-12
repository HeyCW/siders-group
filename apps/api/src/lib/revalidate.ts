// Calls the API-facing side of `apps/web/app/api/revalidate/route.ts`, one path per call — the
// route accepts exactly one `path` per POST. A failed call is logged and swallowed: the write
// that triggered it is already committed, and ISR's 60s window is the backstop
// (design.md - "Revalidation: three paths, named explicitly").

import type { Env } from '../config/env.js';
import type { Logger } from './logger.js';

export type RevalidateEnv = Pick<Env, 'APP_ORIGIN' | 'REVALIDATE_SECRET'>;

async function revalidatePath(env: RevalidateEnv, logger: Logger, path: string): Promise<void> {
  try {
    const res = await fetch(`${env.APP_ORIGIN}/api/revalidate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-revalidate-secret': env.REVALIDATE_SECRET },
      body: JSON.stringify({ path }),
    });
    if (!res.ok) {
      logger.warn({ path, status: res.status }, 'revalidation request rejected');
    }
  } catch (err) {
    logger.warn({ err, path }, 'revalidation request failed');
  }
}

/**
 * The three paths a public article change can affect (design.md - "Revalidation: three paths,
 * named explicitly"): its own detail page, the listing that includes it, and the homepage.
 * Called on publish, unpublish, delete, worker promotion, and any update to a currently
 * visible article.
 */
export async function revalidateArticlePaths(
  env: RevalidateEnv,
  logger: Logger,
  ...slugs: string[]
): Promise<void> {
  // Variadic so a slug change revalidates both the old and new detail paths in one pass. Calling
  // this twice instead would re-request `/news` and `/` a second time — six POSTs where four do,
  // on the critical path of an admin save.
  const detailPaths = [...new Set(slugs)].map((slug) => `/news/${slug}`);
  await Promise.all(
    [...detailPaths, '/news', '/'].map((path) => revalidatePath(env, logger, path)),
  );
}

/**
 * A curation write changes only the homepage — no article's own page changed, and `/news` does
 * not show curation — so it revalidates `/` alone, never the three-path bundle above
 * (specs/home-curation/spec.md - "Curation writes revalidate the homepage").
 */
export async function revalidateHomePath(env: RevalidateEnv, logger: Logger): Promise<void> {
  await revalidatePath(env, logger, '/');
}
