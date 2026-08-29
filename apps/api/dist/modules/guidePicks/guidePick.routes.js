import { Router } from 'express';
import { createLogger } from '../../lib/logger.js';
import { createGuidePickRepository } from './guidePick.repository.js';
import { createGuidePickService, createPublicGuidePickService } from './guidePick.service.js';
import { createGuidePickController, createPublicGuidePickController } from './guidePick.controller.js';
import { requirePermission, requirePublic } from '../../middleware/authorize.js';
import { publicReadRateLimiter } from '../../middleware/rateLimit.js';
/**
 * Admin guide-pick endpoints, mounted at `/admin/guide-picks`. Gated on `news.manage` — a weekly
 * city guide is editorial content, unlike a partner logo
 * (design.md - "Permission: reuse news.manage"). Mirrors `partner.routes.ts`: the reorder
 * endpoint shares this router with `/:id`, so it is registration order, declared explicitly
 * below, that keeps `PUT /admin/guide-picks/order` from ever being read as an id.
 */
export function guidePickRoutes(db, env) {
    const router = Router();
    const repository = createGuidePickRepository(db);
    const service = createGuidePickService(repository, env, createLogger(env));
    const controller = createGuidePickController(service, env);
    router.post('/', requirePermission('news.manage'), controller.create);
    router.get('/', requirePermission('news.manage'), controller.list);
    // Declared before the `/:id` routes: Express matches in registration order, and `order` is a
    // syntactically valid `:id`, so this ordering — not the path shape — is what keeps the two
    // unambiguous if a `PUT /:id` is ever added.
    router.put('/order', requirePermission('news.manage'), controller.reorder);
    router.patch('/:id', requirePermission('news.manage'), controller.update);
    router.delete('/:id', requirePermission('news.manage'), controller.remove);
    return router;
}
/**
 * The public guide-pick listing, mounted at `/guide-picks`. Explicitly declared with
 * `requirePublic()` and rate-limited per client, matching the public partner listing and
 * homepage endpoints (specs/guide-of-the-week-management/spec.md - "Public read serves only
 * active guide picks in order").
 */
export function publicGuidePickRoutes(db, env) {
    const router = Router();
    const repository = createGuidePickRepository(db);
    const service = createPublicGuidePickService(repository);
    const controller = createPublicGuidePickController(service, env);
    router.get('/', requirePublic(), publicReadRateLimiter('public-guide-picks'), controller.list);
    return router;
}
