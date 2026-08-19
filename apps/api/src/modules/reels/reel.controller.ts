import type { NextFunction, Request, Response } from 'express';
import { reelCreateRequestSchema, reelUpdateRequestSchema } from '@siders/contracts';
import type { ReelService } from './reel.service.js';
import { toReelResponse } from './reel.mapper.js';
import { requireUuidParam } from '../../lib/requireParam.js';
import type { Env } from '../../config/env.js';

/** Parse, delegate, respond. Admin reel-library endpoints. No `if` about business meaning
 *  lives here — see `reel.service.ts` for URL parsing and constraint translation. */
export function createReelController(service: ReelService, env: Pick<Env, 'MEDIA_PUBLIC_BASE_URL'>) {
  return {
    async create(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const body = reelCreateRequestSchema.parse(req.body);
        const row = await service.create({ ...body, posterMediaId: body.posterMediaId ?? null, caption: body.caption ?? null });
        res.status(201).json({ success: true, data: toReelResponse(env, row) });
      } catch (err) {
        next(err);
      }
    },

    async list(_req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const rows = await service.list();
        res.json({ success: true, data: rows.map((row) => toReelResponse(env, row)) });
      } catch (err) {
        next(err);
      }
    },

    async get(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const id = requireUuidParam(req, 'id');
        const row = await service.get(id);
        res.json({ success: true, data: toReelResponse(env, row) });
      } catch (err) {
        next(err);
      }
    },

    async update(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const id = requireUuidParam(req, 'id');
        const body = reelUpdateRequestSchema.parse(req.body);
        const row = await service.update(id, body);
        res.json({ success: true, data: toReelResponse(env, row) });
      } catch (err) {
        next(err);
      }
    },

    async remove(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const id = requireUuidParam(req, 'id');
        await service.delete(id);
        res.status(204).end();
      } catch (err) {
        next(err);
      }
    },
  };
}
