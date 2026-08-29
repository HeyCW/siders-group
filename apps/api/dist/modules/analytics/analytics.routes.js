import { Router } from 'express';
import { createAnalyticsRepository } from './analytics.repository.js';
import { createAnalyticsService } from './analytics.service.js';
import { createAnalyticsController } from './analytics.controller.js';
import { requirePermission } from '../../middleware/authorize.js';
/**
 * The admin dashboard, mounted at `/admin/dashboard`. Gated on `dashboard.view` alone — no
 * per-tile permission, and no new permission catalog entry is introduced
 * (specs/admin-dashboard/spec.md - "Permission-gated dashboard endpoint"). One board, deliberately
 * not personalized per caller (design.md - "One board, gated on dashboard.view alone").
 */
export function analyticsRoutes(db) {
    const router = Router();
    const repository = createAnalyticsRepository(db);
    const service = createAnalyticsService(repository);
    const controller = createAnalyticsController(service);
    router.get('/', requirePermission('dashboard.view'), controller.getDashboard);
    return router;
}
