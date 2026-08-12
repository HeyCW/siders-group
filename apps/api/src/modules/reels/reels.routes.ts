import { Router } from 'express';
import type { Database } from '@siders/db';
import type { Env } from '../../config/env.js';
import { createLogger } from '../../lib/logger.js';
import { createReelRepository } from './reel.repository.js';
import { createReelService } from './reel.service.js';
import { createReelController } from './reel.controller.js';
import { createReelsCurationRepository } from './reelsCuration.repository.js';
import { createReelsCurationService } from './reelsCuration.service.js';
import { createPublicReelsService } from './publicReels.service.js';
import { createReelsCurationController, createPublicReelsController } from './reelsCuration.controller.js';
import { requirePermission, requirePublic } from '../../middleware/authorize.js';
import { publicReadRateLimiter } from '../../middleware/rateLimit.js';

/**
 * Admin reel-library endpoints, mounted at `/admin/reels` — create, read, update, delete the
 * reel library itself. Gated on the existing `news.manage`, same as every other admin news
 * surface (specs/reels-curation/spec.md - "Permission-gated reels endpoints").
 */
export function reelRoutes(db: Database, env: Env) {
  const router = Router();
  const repository = createReelRepository(db);
  const service = createReelService(repository, env, createLogger(env));
  const controller = createReelController(service, env);

  router.post('/', requirePermission('news.manage'), controller.create);
  router.get('/', requirePermission('news.manage'), controller.list);
  router.get('/:id', requirePermission('news.manage'), controller.get);
  router.patch('/:id', requirePermission('news.manage'), controller.update);
  router.delete('/:id', requirePermission('news.manage'), controller.remove);

  return router;
}

/**
 * Admin ordering endpoints, mounted at `/admin/reels-curation` — a sibling of `/admin/reels`
 * rather than nested under it (`/admin/reels/curation`). Nesting would make this route's
 * resolution depend on registration order in `server.ts`: `/admin/reels` already declares
 * `GET/PATCH/DELETE /:id`, and `curation` is a syntactically valid (if semantically wrong)
 * value for `:id` — Express matches whichever mounted router's route pattern matches first, so
 * a nested path would silently route `GET /admin/reels/curation` into `controller.get` with
 * `id: 'curation'` if `/admin/reels` happened to be mounted first, or work only by relying on
 * mount order in `server.ts` if not. A sibling path removes the ambiguity structurally, matching
 * `home-curation`'s own precedent (`/admin/curation`, a sibling of `/admin/articles`, never
 * `/admin/articles/curation`).
 */
export function reelsCurationRoutes(db: Database, env: Env) {
  const router = Router();
  const repository = createReelsCurationRepository(db);
  const service = createReelsCurationService(repository, env, env, createLogger(env));
  const controller = createReelsCurationController(service);

  router.get('/', requirePermission('news.manage'), controller.list);
  router.put('/', requirePermission('news.manage'), controller.replace);

  return router;
}

/**
 * The public reels rail, mounted at `/reels`. Explicitly declared with `requirePublic()` and
 * rate-limited per client, matching the public article and homepage endpoints
 * (specs/reels-curation/spec.md - "Public reels endpoint serves structured data").
 */
export function publicReelsRoutes(db: Database, env: Pick<Env, 'MEDIA_PUBLIC_BASE_URL'>) {
  const router = Router();
  const repository = createReelsCurationRepository(db);
  const service = createPublicReelsService(repository, env);
  const controller = createPublicReelsController(service);

  router.get('/', requirePublic(), publicReadRateLimiter('public-reels'), controller.getRail);

  return router;
}
