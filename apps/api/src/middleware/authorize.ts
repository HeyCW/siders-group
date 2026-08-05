import type { NextFunction, Request, Response } from 'express';
import { AppError } from './errorHandler.js';
import type { StaffRole } from './authenticate.js';

/** Requires `authenticate` to have run first and populated `req.auth`. */
export function requireStaff(...allowedRoles: StaffRole[]) {
  return function requireStaffMiddleware(req: Request, _res: Response, next: NextFunction): void {
    const auth = req.auth;
    if (!auth || auth.subjectType !== 'staff') {
      next(new AppError('Staff session required', 403, 'forbidden'));
      return;
    }
    if (allowedRoles.length > 0 && (!auth.role || !allowedRoles.includes(auth.role))) {
      next(new AppError('Insufficient role', 403, 'forbidden'));
      return;
    }
    next();
  };
}
