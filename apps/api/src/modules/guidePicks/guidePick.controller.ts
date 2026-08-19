import type { NextFunction, Request, Response } from 'express';
import {
  guidePickCreateRequestSchema,
  guidePickReorderRequestSchema,
  guidePickUpdateRequestSchema,
} from '@siders/contracts';
import type { GuidePickService, PublicGuidePickService } from './guidePick.service.js';
import { toGuidePickResponse, toPublicGuidePick } from './guidePick.mapper.js';
import { requireUuidParam } from '../../lib/requireParam.js';
import type { Env } from '../../config/env.js';

/** Parse, delegate, respond. Admin (permission-gated) guide-pick endpoints. */
export function createGuidePickController(service: GuidePickService, env: Pick<Env, 'MEDIA_PUBLIC_BASE_URL'>) {
  return {
    async create(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const body = guidePickCreateRequestSchema.parse(req.body);
        const row = await service.create(body);
        res.status(201).json({ success: true, data: toGuidePickResponse(env, row) });
      } catch (err) {
        next(err);
      }
    },

    async list(_req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const rows = await service.list();
        res.json({ success: true, data: rows.map((row) => toGuidePickResponse(env, row)) });
      } catch (err) {
        next(err);
      }
    },

    async update(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const id = requireUuidParam(req, 'id');
        const body = guidePickUpdateRequestSchema.parse(req.body);
        const row = await service.update(id, body);
        res.json({ success: true, data: toGuidePickResponse(env, row) });
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

    async reorder(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const body = guidePickReorderRequestSchema.parse(req.body);
        const rows = await service.reorder(body.guidePickIds);
        res.json({ success: true, data: rows.map((row) => toGuidePickResponse(env, row)) });
      } catch (err) {
        next(err);
      }
    },
  };
}

/** Parse, delegate, respond. Public (unauthenticated) guide-pick listing endpoint. */
export function createPublicGuidePickController(
  service: PublicGuidePickService,
  env: Pick<Env, 'MEDIA_PUBLIC_BASE_URL'>,
) {
  return {
    async list(_req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const rows = await service.listPublic();
        res.json({ success: true, data: rows.map((row) => toPublicGuidePick(env, row)) });
      } catch (err) {
        next(err);
      }
    },
  };
}
