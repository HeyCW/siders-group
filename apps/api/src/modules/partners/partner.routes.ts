import { Router } from 'express';
import type { Database } from '@siders/db';
import type { Env } from '../../config/env.js';
import { createLogger } from '../../lib/logger.js';
import { createPartnerRepository } from './partner.repository.js';
import { createPartnerService, createPublicPartnerService } from './partner.service.js';
import { createPartnerController, createPublicPartnerController } from './partner.controller.js';
import { requirePermission, requirePublic } from '../../middleware/authorize.js';
import { publicReadRateLimiter } from '../../middleware/rateLimit.js';

/**
 * Admin partner endpoints, mounted at `/admin/partners`. Gated on `settings.manage` rather than
 * `news.manage` — a partner is site configuration, not editorial content
 * (design.md - "Permission: reuse settings.manage"). Unlike `reels.routes.ts`, which removes the
 * `/:id` ambiguity structurally by mounting curation on a separate path, the reorder endpoint here
 * shares this router with `/:id` — so it is registration order, declared explicitly below, that
 * keeps `PUT /admin/partners/order` from ever being read as an id.
 */
export function partnerRoutes(db: Database, env: Env) {
  const router = Router();
  const repository = createPartnerRepository(db);
  const service = createPartnerService(repository, env, createLogger(env));
  const controller = createPartnerController(service, env);

  router.post('/', requirePermission('settings.manage'), controller.create);
  router.get('/', requirePermission('settings.manage'), controller.list);
  // Declared before the `/:id` routes: Express matches in registration order, and `order` is a
  // syntactically valid `:id`, so this ordering — not the path shape — is what keeps the two
  // unambiguous if a `PUT /:id` is ever added.
  router.put('/order', requirePermission('settings.manage'), controller.reorder);
  router.patch('/:id', requirePermission('settings.manage'), controller.update);
  router.delete('/:id', requirePermission('settings.manage'), controller.remove);

  return router;
}

/**
 * The public partner listing, mounted at `/partners`. Explicitly declared with `requirePublic()`
 * and rate-limited per client, matching the public reels rail and homepage endpoints
 * (specs/partner-management/spec.md - "Public partner listing serves only active partners in
 * order").
 */
export function publicPartnerRoutes(db: Database, env: Pick<Env, 'MEDIA_PUBLIC_BASE_URL'>) {
  const router = Router();
  const repository = createPartnerRepository(db);
  const service = createPublicPartnerService(repository);
  const controller = createPublicPartnerController(service, env);

  router.get('/', requirePublic(), publicReadRateLimiter('public-partners'), controller.list);

  return router;
}
