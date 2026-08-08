import { Router } from 'express';
import type { PingResponse } from '@siders/contracts';
import { requirePublic } from '../../middleware/authorize.js';

export function healthRoutes(): Router {
  const router = Router();

  router.get('/', requirePublic(), (_req, res) => {
    const body: PingResponse = { status: 'ok', timestamp: new Date().toISOString() };
    res.json(body);
  });
  return router;
}
