import type { NextFunction, Request, Response } from 'express';
import {
  partnerCreateRequestSchema,
  partnerReorderRequestSchema,
  partnerUpdateRequestSchema,
} from '@siders/contracts';
import type { PartnerService, PublicPartnerService } from './partner.service.js';
import { toPartnerResponse, toPublicPartner } from './partner.mapper.js';
import { requireUuidParam } from '../../lib/requireParam.js';
import type { Env } from '../../config/env.js';

/** Parse, delegate, respond. Admin (permission-gated) partner endpoints. */
export function createPartnerController(service: PartnerService, env: Pick<Env, 'MEDIA_PUBLIC_BASE_URL'>) {
  return {
    async create(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const body = partnerCreateRequestSchema.parse(req.body);
        const row = await service.create(body);
        res.status(201).json({ success: true, data: toPartnerResponse(env, row) });
      } catch (err) {
        next(err);
      }
    },

    async list(_req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const rows = await service.list();
        res.json({ success: true, data: rows.map((row) => toPartnerResponse(env, row)) });
      } catch (err) {
        next(err);
      }
    },

    async update(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const id = requireUuidParam(req, 'id');
        const body = partnerUpdateRequestSchema.parse(req.body);
        const row = await service.update(id, body);
        res.json({ success: true, data: toPartnerResponse(env, row) });
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
        const body = partnerReorderRequestSchema.parse(req.body);
        const rows = await service.reorder(body.partnerIds);
        res.json({ success: true, data: rows.map((row) => toPartnerResponse(env, row)) });
      } catch (err) {
        next(err);
      }
    },
  };
}

/** Parse, delegate, respond. Public (unauthenticated) partner listing endpoint. */
export function createPublicPartnerController(service: PublicPartnerService, env: Pick<Env, 'MEDIA_PUBLIC_BASE_URL'>) {
  return {
    async list(_req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const rows = await service.listPublic();
        res.json({ success: true, data: rows.map((row) => toPublicPartner(env, row)) });
      } catch (err) {
        next(err);
      }
    },
  };
}
