import { Router } from 'express';
import type { Database } from '@siders/db';
import type { Env } from '../../config/env.js';
import { createArticleRepository } from '../articles/article.repository.js';
import { createHyperlocalSpotlightRepository } from './hyperlocalSpotlight.repository.js';
import { createHyperlocalSpotlightService } from './hyperlocalSpotlight.service.js';
import { createHyperlocalSpotlightController } from './hyperlocalSpotlight.controller.js';
import { requirePermission, requirePublic } from '../../middleware/authorize.js';
import { publicReadRateLimiter } from '../../middleware/rateLimit.js';

/**
 * Admin spotlight read, mounted at `/admin/hyperlocal-spotlight`. Read-only — the spotlight is
 * written only through the article create/update endpoints
 * (specs/hyperlocal-spotlight/spec.md - "The spotlight is set from the article editor"). Gated
 * by the same `news.manage` permission as curation and article writes; no new permission entry
 * (specs/hyperlocal-spotlight/spec.md - "Admin read of the current spotlight").
 */
export function hyperlocalSpotlightRoutes(db: Database, env: Env) {
  const router = Router();
  const spotlightRepository = createHyperlocalSpotlightRepository(db);
  const articleRepository = createArticleRepository(db);
  const service = createHyperlocalSpotlightService(spotlightRepository, articleRepository, env);
  const controller = createHyperlocalSpotlightController(service);

  router.get('/', requirePermission('news.manage'), controller.getAdmin);

  return router;
}

/**
 * The public spotlight read, mounted at `/home/hyperlocal-spotlight`. Explicitly declared with
 * `requirePublic()` and rate-limited per client, matching the public homepage feed
 * (specs/hyperlocal-spotlight/spec.md - "Public read is rate-limited like other public reads").
 */
export function publicHyperlocalSpotlightRoutes(db: Database, env: Pick<Env, 'MEDIA_PUBLIC_BASE_URL'>) {
  const router = Router();
  const spotlightRepository = createHyperlocalSpotlightRepository(db);
  const articleRepository = createArticleRepository(db);
  const service = createHyperlocalSpotlightService(spotlightRepository, articleRepository, env);
  const controller = createHyperlocalSpotlightController(service);

  router.get('/', requirePublic(), publicReadRateLimiter('public-hyperlocal-spotlight'), controller.getPublic);

  return router;
}
