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
export async function revalidateArticlePaths(env: RevalidateEnv, logger: Logger, slug: string): Promise<void> {
  await Promise.all([
    revalidatePath(env, logger, `/news/${slug}`),
    revalidatePath(env, logger, '/news'),
    revalidatePath(env, logger, '/'),
  ]);
}
