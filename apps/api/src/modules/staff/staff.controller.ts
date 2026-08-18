import type { NextFunction, Request, Response } from 'express';
import { staffCreateRequestSchema, staffPasswordChangeRequestSchema } from '@siders/contracts';
import type { StaffService } from './staff.service.js';
import { toStaffAccountResponse, toStaffCreateResponse, toStaffResetResponse } from './staff.mapper.js';
import { AppError } from '../../middleware/errorHandler.js';
import { requireUuidParam } from '../../lib/requireParam.js';

function requireCaller(req: Request): { subjectId: string; isOwner: boolean } {
  const subjectId = req.auth?.subjectId;
  if (!subjectId) throw new AppError('Not authenticated', 401, 'unauthenticated');
  return { subjectId, isOwner: req.staffRole?.isOwner ?? false };
}

function requireSession(req: Request): { subjectId: string; sessionId: string } {
  if (!req.auth?.subjectId || !req.auth.sessionId) throw new AppError('Not authenticated', 401, 'unauthenticated');
  return { subjectId: req.auth.subjectId, sessionId: req.auth.sessionId };
}

/** Parse, delegate, respond. No `if` about business meaning lives here. */
export function createStaffController(service: StaffService) {
  return {
    async list(_req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const rows = await service.list();
        res.json({ success: true, data: rows.map(toStaffAccountResponse) });
      } catch (err) {
        next(err);
      }
    },

    async create(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const body = staffCreateRequestSchema.parse(req.body);
        const caller = requireCaller(req);
        const { account, temporaryPassword } = await service.create(body, caller);
        res.status(201).json({ success: true, data: toStaffCreateResponse(account, temporaryPassword) });
      } catch (err) {
        next(err);
      }
    },

    async disable(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const caller = requireCaller(req);
        const targetId = requireUuidParam(req, 'id');
        await service.disable(targetId, caller);
        res.status(204).end();
      } catch (err) {
        next(err);
      }
    },

    async triggerReset(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const caller = requireCaller(req);
        const targetId = requireUuidParam(req, 'id');
        const { temporaryPassword } = await service.triggerReset(targetId, caller);
        res.status(200).json({ success: true, data: toStaffResetResponse(temporaryPassword) });
      } catch (err) {
        next(err);
      }
    },

    async changePassword(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const body = staffPasswordChangeRequestSchema.parse(req.body);
        const { subjectId, sessionId } = requireSession(req);
        await service.changePassword(subjectId, sessionId, body.currentPassword, body.newPassword);
        res.status(204).end();
      } catch (err) {
        next(err);
      }
    },
  };
}
