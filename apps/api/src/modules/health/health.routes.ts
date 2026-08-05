import { Router } from 'express';
import type { PingResponse } from '@siders/contracts';

export function healthRoutes(): Router {
  const router = Router();

  router.get('/', (_req, res) => {
    const body: PingResponse = { status: 'ok', timestamp: new Date().toISOString() };
    res.json(body);
  });

  return router;
}
