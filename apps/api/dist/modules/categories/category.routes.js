import { Router } from 'express';
import { createCategoryRepository } from './category.repository.js';
import { createCategoryService } from './category.service.js';
import { createCategoryController } from './category.controller.js';
import { requirePermission, requirePublic } from '../../middleware/authorize.js';
/**
 * Listing is public (categories are reference data needed to render public filters); create,
 * update, and delete are gated on `category.manage`, never on `news.manage`
 * (specs/category-management/spec.md - "Permission-gated category endpoints").
 */
export function categoryRoutes(db) {
    const router = Router();
    const service = createCategoryService(createCategoryRepository(db));
    const controller = createCategoryController(service);
    router.get('/', requirePublic(), controller.list);
    router.post('/', requirePermission('category.manage'), controller.create);
    router.patch('/:id', requirePermission('category.manage'), controller.update);
    router.delete('/:id', requirePermission('category.manage'), controller.remove);
    return router;
}
