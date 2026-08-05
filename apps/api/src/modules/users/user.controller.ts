import type { NextFunction, Request, Response } from 'express';
import type { UserService } from './user.service.js';
import { AppError } from '../../middleware/errorHandler.js';

/** Parse, delegate, respond. No `if` about business meaning lives here. */
export function createUserController(service: UserService) {
  return {
    async getMe(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const subjectId = req.auth?.subjectId;
        if (!subjectId) throw new AppError('Not authenticated', 401, 'unauthenticated');
        const user = await service.getById(subjectId);
        if (!user) throw new AppError('User not found', 404, 'not_found');
        res.json({ success: true, data: user });
      } catch (err) {
        next(err);
      }
    },
  };
}
