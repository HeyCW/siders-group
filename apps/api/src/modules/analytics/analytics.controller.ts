import type { NextFunction, Request, Response } from 'express';
import type { AnalyticsService } from './analytics.service.js';

/** Parse, delegate, respond. One permission-gated endpoint, no request body or query to parse. */
export function createAnalyticsController(service: AnalyticsService) {
  return {
    async getDashboard(_req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const data = await service.getDashboard();
        res.json({ success: true, data });
      } catch (err) {
        next(err);
      }
    },
  };
}
