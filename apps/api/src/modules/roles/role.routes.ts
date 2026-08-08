import { Router } from 'express';
import type { Database } from '@siders/db';
import { createRoleRepository } from './role.repository.js';
import { createRoleService } from './role.service.js';
import { createRoleController } from './role.controller.js';
import { requirePermission } from '../../middleware/authorize.js';

export function roleRoutes(db: Database) {
  const router = Router();
  const service = createRoleService(db, createRoleRepository(db));
  const controller = createRoleController(service);

  router.get('/permissions', requirePermission('role.manage'), controller.listPermissionCatalog);
  router.post('/', requirePermission('role.manage'), controller.create);
  router.patch('/:id', requirePermission('role.manage'), controller.update);
  router.delete('/:id', requirePermission('role.manage'), controller.delete);
  router.post('/assign/:staffId', requirePermission('role.manage'), controller.assign);

  return router;
}
