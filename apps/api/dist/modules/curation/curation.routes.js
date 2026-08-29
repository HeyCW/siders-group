import { Router } from 'express';
import { createLogger } from '../../lib/logger.js';
import { createHomeCurationRepository } from './curation.repository.js';
import { createHomeCurationService } from './curation.service.js';
import { createHomeFeedService } from './homeFeed.service.js';
import { createHomeCurationController, createHomeFeedController } from './curation.controller.js';
import { createArticleRepository } from '../articles/article.repository.js';
import { requirePermission, requirePublic } from '../../middleware/authorize.js';
import { publicReadRateLimiter } from '../../middleware/rateLimit.js';
/**
 * Admin curation endpoints, mounted at `/admin/curation`. Both routes are gated by
 * `requirePermission('news.manage')` — deciding the front page is treated as part of the
 * news-editing job, and no dedicated `curation.manage` permission is introduced
 * (specs/home-curation/spec.md - "Permission-gated curation endpoints").
 */
export function curationRoutes(db, env) {
    const router = Router();
    const repository = createHomeCurationRepository(db);
    const service = createHomeCurationService(repository, env, createLogger(env));
    const controller = createHomeCurationController(service);
    router.get('/', requirePermission('news.manage'), controller.list);
    router.put('/', requirePermission('news.manage'), controller.replace);
    return router;
}
/**
 * The public homepage feed, mounted at `/home`. Explicitly declared with `requirePublic()` and
 * rate-limited per client, matching the public article endpoints
 * (specs/home-curation/spec.md - "Public homepage feed composes curated picks with chronological
 * backfill").
 */
export function publicHomeRoutes(db, env) {
    const router = Router();
    const curationRepository = createHomeCurationRepository(db);
    const articleRepository = createArticleRepository(db);
    const service = createHomeFeedService(curationRepository, articleRepository, env);
    const controller = createHomeFeedController(service);
    router.get('/', requirePublic(), publicReadRateLimiter('public-home-feed'), controller.getFeed);
    return router;
}
