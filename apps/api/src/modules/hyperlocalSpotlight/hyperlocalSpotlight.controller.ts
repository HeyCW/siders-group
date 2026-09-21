import type { NextFunction, Request, Response } from 'express';
import type { HyperlocalSpotlightService } from './hyperlocalSpotlight.service.js';

/** Parse, delegate, respond. Read-only on both sides — there is no write endpoint here; the
 *  spotlight is written only through the article create/update endpoints
 *  (specs/hyperlocal-spotlight/spec.md - "No separate write surface exists"). */
export function createHyperlocalSpotlightController(service: HyperlocalSpotlightService) {
  return {
    async getAdmin(_req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const spotlight = await service.getAdmin();
        res.json({ success: true, data: spotlight });
      } catch (err) {
        next(err);
      }
    },

    async getPublic(_req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const spotlight = await service.getPublic();
        res.json({ success: true, data: spotlight });
      } catch (err) {
        next(err);
      }
    },
  };
}
