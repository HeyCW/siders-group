import type { NextFunction, Request, Response } from 'express';
import { mediaUpdateRequestSchema, mediaUploadMetadataSchema } from '@siders/contracts';
import type { MediaService } from './media.service.js';
import { toMediaResponse } from './media.mapper.js';
import { AppError } from '../../middleware/errorHandler.js';
import { requireUuidParam } from '../../lib/requireParam.js';
import type { Env } from '../../config/env.js';

function requireCaller(req: Request): { subjectId: string } {
  const subjectId = req.auth?.subjectId;
  if (!subjectId) throw new AppError('Not authenticated', 401, 'unauthenticated');
  return { subjectId };
}

/** Parse, delegate, respond. No `if` about business meaning lives here. */
export function createMediaController(service: MediaService, env: Pick<Env, 'MEDIA_PUBLIC_BASE_URL'>) {
  return {
    async upload(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        if (!req.file) {
          throw new AppError('A file is required', 400, 'file_required');
        }
        const metadata = mediaUploadMetadataSchema.parse(req.body);
        const caller = requireCaller(req);
        const row = await service.upload({
          buffer: req.file.buffer,
          declaredMime: req.file.mimetype,
          originalFilename: req.file.originalname,
          alt: metadata.alt,
          caption: metadata.caption,
          uploadedBy: caller.subjectId,
        });
        res.status(201).json({ success: true, data: toMediaResponse(env, row) });
      } catch (err) {
        next(err);
      }
    },

    async get(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const id = requireUuidParam(req, 'id');
        const row = await service.get(id);
        res.json({ success: true, data: toMediaResponse(env, row) });
      } catch (err) {
        next(err);
      }
    },

    async update(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const id = requireUuidParam(req, 'id');
        const body = mediaUpdateRequestSchema.parse(req.body);
        const row = await service.update(id, body);
        res.json({ success: true, data: toMediaResponse(env, row) });
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
