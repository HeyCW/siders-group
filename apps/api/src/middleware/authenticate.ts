import type { NextFunction, Request, Response } from 'express';
import { AppError } from './errorHandler.js';

export type StaffRole = 'owner' | 'editor' | 'author';

export interface AuthContext {
  subjectId: string;
  subjectType: 'staff' | 'reader';
  role?: StaffRole;
}

declare module 'express-serve-static-core' {
  interface Request {
    auth?: AuthContext;
  }
}

/**
 * Reads the session cookie and verifies the JWT, populating `req.auth`.
 * Stub: always rejects until the auth/users follow-up change implements
 * session issuance and verification (lib/tokens.ts).
 */
export function authenticate(_req: Request, _res: Response, next: NextFunction): void {
  next(new AppError('Not authenticated', 401, 'unauthenticated'));
}
