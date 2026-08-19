import { Router } from 'express';
import type { Database } from '@siders/db';
import { createAnakUsahaRepository } from './anakUsaha.repository.js';
import { createAnakUsahaService } from './anakUsaha.service.js';
import { createAnakUsahaController } from './anakUsaha.controller.js';
import { requirePermission, requirePublic } from '../../middleware/authorize.js';

/**
 * Listing is public (anak usaha entries are reference data an article editor needs regardless of
 * whether they hold the management permission — mirrors `category.routes.ts`); create, update,
 * and delete are gated on `anak-usaha.manage`, never on `news.manage`
 * (specs/anak-usaha-management/spec.md - "Permission-gated anak usaha endpoints").
 */
export function anakUsahaRoutes(db: Database) {
  const router = Router();
  const service = createAnakUsahaService(createAnakUsahaRepository(db));
  const controller = createAnakUsahaController(service);

  router.get('/', requirePublic(), controller.list);
  router.post('/', requirePermission('anak-usaha.manage'), controller.create);
  router.patch('/:id', requirePermission('anak-usaha.manage'), controller.update);
  router.delete('/:id', requirePermission('anak-usaha.manage'), controller.remove);

  return router;
}
