import { Router } from 'express';
import type { Database } from '@siders/db';
import type { Env } from '../../config/env.js';
import { createLogger } from '../../lib/logger.js';
import { createArticleRepository } from './article.repository.js';
import { createArticleService } from './article.service.js';
import { createArticleController, createPublicArticleController } from './article.controller.js';
import { requirePermission, requirePublic } from '../../middleware/authorize.js';
import { publicReadRateLimiter } from '../../middleware/rateLimit.js';

/**
 * Admin article endpoints, mounted at `/admin/articles`. Every route is gated by
 * `requirePermission('news.manage')` — never a bare `requireStaff`
 * (specs/article-management/spec.md - "Permission-gated article endpoints"; design.md -
 * "Authorization: permission-based, per domain").
 */
export function articleRoutes(db: Database, env: Env) {
  const router = Router();
  const repository = createArticleRepository(db);
  const service = createArticleService(repository, env, createLogger(env));
  const controller = createArticleController(service, env);

  router.post('/', requirePermission('news.manage'), controller.create);
  router.get('/', requirePermission('news.manage'), controller.list);
  router.get('/:id', requirePermission('news.manage'), controller.get);
  router.patch('/:id', requirePermission('news.manage'), controller.update);
  router.patch('/:id/autosave', requirePermission('news.manage'), controller.autosave);
  router.delete('/:id', requirePermission('news.manage'), controller.remove);
  router.post('/:id/publish', requirePermission('news.manage'), controller.publish);
  router.post('/:id/unpublish', requirePermission('news.manage'), controller.unpublish);
  router.post('/:id/schedule', requirePermission('news.manage'), controller.schedule);
  router.get('/:id/preview', requirePermission('news.manage'), controller.preview);

  return router;
}

/**
 * Public article endpoints, mounted at `/articles`. Explicitly declared with `requirePublic()`
 * and rate-limited per client (specs/public-news-api/spec.md - "Public endpoints require no
 * authentication"; tasks.md - 8.10).
 */
export function publicArticleRoutes(db: Database, env: Pick<Env, 'MEDIA_PUBLIC_BASE_URL'>) {
  const router = Router();
  const repository = createArticleRepository(db);
  const controller = createPublicArticleController(repository, env);

  router.get('/', requirePublic(), publicReadRateLimiter('public-article-read'), controller.list);
  router.get('/:slug', requirePublic(), publicReadRateLimiter('public-article-read'), controller.getBySlug);

  return router;
}
