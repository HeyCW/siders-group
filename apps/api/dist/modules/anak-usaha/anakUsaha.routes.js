import { Router } from 'express';
import { createAnakUsahaRepository } from './anakUsaha.repository.js';
import { createAnakUsahaService } from './anakUsaha.service.js';
import { createAnakUsahaController } from './anakUsaha.controller.js';
import { requirePermission, requirePublic } from '../../middleware/authorize.js';
/**
 * Listing is public (anak usaha entries are reference data an article editor needs regardless of
 * whether they hold the management permission — mirrors `category.routes.ts`); create, update,
 * and delete are gated on `anak-usaha.manage`, never on `news.manage`
 * (specs/anak-usaha-management/spec.md - "Permission-gated anak usaha endpoints"). Profile
 * management and its admin-only listing reuse the same `anak-usaha.manage` permission
 * (specs/anak-usaha-presentation/spec.md - "Permission-gated profile endpoints").
 */
export function anakUsahaRoutes(db, env) {
    const router = Router();
    const service = createAnakUsahaService(createAnakUsahaRepository(db));
    const controller = createAnakUsahaController(service, env);
    router.get('/', requirePublic(), controller.list);
    router.get('/admin', requirePermission('anak-usaha.manage'), controller.listAdmin);
    router.post('/', requirePermission('anak-usaha.manage'), controller.create);
    // Declared before `/:id`, mirroring `partner.routes.ts`'s note: `profile/order` is a
    // syntactically valid `:id/profile`-shaped path is not — three segments vs two — so there is no
    // actual ambiguity here, but the explicit ordering documents the same intent.
    router.put('/profile/order', requirePermission('anak-usaha.manage'), controller.reorderProfiles);
    router.post('/:id/profile', requirePermission('anak-usaha.manage'), controller.createProfile);
    router.patch('/:id/profile', requirePermission('anak-usaha.manage'), controller.updateProfile);
    router.delete('/:id/profile', requirePermission('anak-usaha.manage'), controller.removeProfile);
    router.patch('/:id', requirePermission('anak-usaha.manage'), controller.update);
    router.delete('/:id', requirePermission('anak-usaha.manage'), controller.remove);
    return router;
}
