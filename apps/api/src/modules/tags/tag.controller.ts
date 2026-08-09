import type { NextFunction, Request, Response } from 'express';
import { tagCreateRequestSchema, tagUpdateRequestSchema } from '@siders/contracts';
import type { TagService } from './tag.service.js';
import { toTagResponse } from './tag.mapper.js';
import { AppError } from '../../middleware/errorHandler.js';

function requireParam(req: Request, name: string): string {
  const value = req.params[name];
  if (!value) throw new AppError(`Missing path parameter: ${name}`, 400, 'bad_request');
  return value;
}

/** Parse, delegate, respond. No `if` about business meaning lives here. */
export function createTagController(service: TagService) {
  return {
    async list(_req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const rows = await service.list();
        res.json({ success: true, data: rows.map(toTagResponse) });
      } catch (err) {
        next(err);
      }
    },

    async create(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const body = tagCreateRequestSchema.parse(req.body);
        const row = await service.create(body.name);
        res.status(201).json({ success: true, data: toTagResponse(row) });
      } catch (err) {
        next(err);
      }
    },

    async update(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const id = requireParam(req, 'id');
        const body = tagUpdateRequestSchema.parse(req.body);
        const row = await service.update(id, body.name);
        res.json({ success: true, data: toTagResponse(row) });
      } catch (err) {
        next(err);
      }
    },

    async remove(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const id = requireParam(req, 'id');
        await service.delete(id);
        res.status(204).end();
      } catch (err) {
        next(err);
      }
    },
  };
}
