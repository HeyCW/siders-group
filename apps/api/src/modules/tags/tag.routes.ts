import { Router } from 'express';
import type { Database } from '@siders/db';
import { createTagRepository } from './tag.repository.js';
import { createTagService } from './tag.service.js';
import { createTagController } from './tag.controller.js';
import { requirePermission, requirePublic } from '../../middleware/authorize.js';

/**
 * Listing is public (tags are reference data needed to render public filters); create, update,
 * and delete are gated on `tag.manage`, never on `news.manage`
 * (specs/tag-management/spec.md - "Permission-gated tag endpoints").
 */
export function tagRoutes(db: Database) {
  const router = Router();
  const service = createTagService(createTagRepository(db));
  const controller = createTagController(service);

  router.get('/', requirePublic(), controller.list);
  router.post('/', requirePermission('tag.manage'), controller.create);
  router.patch('/:id', requirePermission('tag.manage'), controller.update);
  router.delete('/:id', requirePermission('tag.manage'), controller.remove);

  return router;
}
