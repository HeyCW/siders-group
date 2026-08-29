import { Router } from 'express';
import { requirePublic } from '../../middleware/authorize.js';
export function healthRoutes() {
    const router = Router();
    router.get('/', requirePublic(), (_req, res) => {
        const body = { status: 'ok', timestamp: new Date().toISOString() };
        res.json(body);
    });
    return router;
}
