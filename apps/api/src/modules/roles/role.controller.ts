import type { NextFunction, Request, Response } from 'express';
import { roleAssignmentRequestSchema, roleCreateRequestSchema, roleUpdateRequestSchema } from '@siders/contracts';
import type { RoleService } from './role.service.js';
import { toRoleResponse } from './role.mapper.js';
import { AppError } from '../../middleware/errorHandler.js';

function requireCaller(req: Request): { subjectId: string; isOwner: boolean } {
  const subjectId = req.auth?.subjectId;
  if (!subjectId) throw new AppError('Not authenticated', 401, 'unauthenticated');
  return { subjectId, isOwner: req.staffRole?.isOwner ?? false };
}

function requireParam(req: Request, name: string): string {
  const value = req.params[name];
  if (!value) throw new AppError(`Missing path parameter: ${name}`, 400, 'bad_request');
  return value;
}

/** Parse, delegate, respond. No `if` about business meaning lives here. */
export function createRoleController(service: RoleService) {
  return {
    async listPermissionCatalog(_req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const catalog = await service.listPermissionCatalog();
        res.json({ success: true, data: catalog });
      } catch (err) {
        next(err);
      }
    },

    async create(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const body = roleCreateRequestSchema.parse(req.body);
        const role = await service.create(body);
        res.status(201).json({ success: true, data: toRoleResponse(role) });
      } catch (err) {
        next(err);
      }
    },

    async update(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const id = requireParam(req, 'id');
        const body = roleUpdateRequestSchema.parse(req.body);
        const role = await service.update(id, body);
        res.json({ success: true, data: toRoleResponse(role) });
      } catch (err) {
        next(err);
      }
    },

    async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const id = requireParam(req, 'id');
        await service.delete(id);
        res.status(204).end();
      } catch (err) {
        next(err);
      }
    },

    async assign(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const targetStaffId = requireParam(req, 'staffId');
        const body = roleAssignmentRequestSchema.parse(req.body);
        const caller = requireCaller(req);
        await service.assign(targetStaffId, body.roleId, caller);
        res.status(204).end();
      } catch (err) {
        next(err);
      }
    },
  };
}
