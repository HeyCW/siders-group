import { Router } from 'express';
import { createRoleRepository } from './role.repository.js';
import { createRoleService } from './role.service.js';
import { createRoleController } from './role.controller.js';
import { requireAnyPermission, requirePermission } from '../../middleware/authorize.js';
export function roleRoutes(db) {
    const router = Router();
    const service = createRoleService(db, createRoleRepository(db));
    const controller = createRoleController(service);
    // Registered before `GET /:id`: without this ordering Express matches the literal
    // "permissions" segment as `:id` and the request dies on UUID validation
    // (design.md - "Route ordering hazard").
    router.get('/permissions', requirePermission('role.manage'), controller.listPermissionCatalog);
    router.get('/', requireAnyPermission('user.manage', 'role.manage'), controller.list);
    router.get('/:id', requirePermission('role.manage'), controller.detail);
    router.post('/', requirePermission('role.manage'), controller.create);
    router.patch('/:id', requirePermission('role.manage'), controller.update);
    router.delete('/:id', requirePermission('role.manage'), controller.delete);
    router.post('/assign/:staffId', requirePermission('role.manage'), controller.assign);
    return router;
}
