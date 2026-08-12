import type { NextFunction, Request, Response } from 'express';
import { homeCurationReplaceRequestSchema, homeFeedQuerySchema } from '@siders/contracts';
import type { HomeCurationService } from './curation.service.js';
import type { HomeFeedService } from './homeFeed.service.js';

/** Parse, delegate, respond. Admin (permission-gated) curation endpoints. */
export function createHomeCurationController(service: HomeCurationService) {
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
        const body = homeCurationReplaceRequestSchema.parse(req.body);
        const entries = await service.replace(body.articleIds);
        res.json({ success: true, data: entries });
      } catch (err) {
        next(err);
      }
    },
  };
}

/** Parse, delegate, respond. Public (unauthenticated) homepage feed endpoint. */
export function createHomeFeedController(service: HomeFeedService) {
  return {
    async getFeed(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const query = homeFeedQuerySchema.parse(req.query);
        const feed = await service.getFeed(query.limit);
        res.json({ success: true, data: feed });
      } catch (err) {
        next(err);
      }
    },
  };
}
