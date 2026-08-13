import type { NextFunction, Request, Response } from 'express';
import { reelsCurationReplaceRequestSchema } from '@siders/contracts';
import type { ReelsCurationService } from './reelsCuration.service.js';
import type { PublicReelsService } from './publicReels.service.js';

/** Parse, delegate, respond. Admin (permission-gated) reels-ordering endpoints. */
export function createReelsCurationController(service: ReelsCurationService) {
  return {
    async list(_req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const entries = await service.list();
        res.json({ success: true, data: entries });
      } catch (err) {
        next(err);
      }
    },

    async replace(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const body = reelsCurationReplaceRequestSchema.parse(req.body);
        const entries = await service.replace(body.reelIds);
        res.json({ success: true, data: entries });
      } catch (err) {
        next(err);
      }
    },
  };
}

/** Parse, delegate, respond. Public (unauthenticated) reels rail endpoint. */
export function createPublicReelsController(service: PublicReelsService) {
  return {
    async getRail(_req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const rail = await service.getRail();
        res.json({ success: true, data: rail });
      } catch (err) {
        next(err);
      }
    },
  };
}
