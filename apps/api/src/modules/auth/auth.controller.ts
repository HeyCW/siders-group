import type { NextFunction, Request, Response } from 'express';
import type { AuthService } from './auth.service.js';
import { toReaderAccountResponse } from './auth.mapper.js';
import { AppError } from '../../middleware/errorHandler.js';
import { clearCsrfCookie, setCsrfCookie } from '../../lib/csrf.js';
import {
  setSessionCookies,
  clearSessionCookies,
  sharedCookieOptions,
  type CookieEnv,
} from '../../lib/cookies.js';
import { REFRESH_TOKEN_COOKIE } from '../../lib/tokens.js';
import { sessionMetaFromRequest, type SessionMetaEnv } from '../../lib/sessionMeta.js';

/** Parse, delegate, respond. No `if` about business meaning lives here. */
export function createAuthController(service: AuthService, env: CookieEnv & SessionMetaEnv) {
  return {
    async refresh(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const raw = req.cookies?.[REFRESH_TOKEN_COOKIE];
        if (typeof raw !== 'string' || raw.length === 0) {
          throw new AppError('No refresh credential presented', 401, 'invalid_refresh_token');
        }
        const issued = await service.refresh(raw, sessionMetaFromRequest(req, env));
        setSessionCookies(res, issued, env);
        setCsrfCookie(res, issued.csrfToken, sharedCookieOptions(env));
        res.status(204).end();
      } catch (err) {
        next(err);
      }
    },

    async logout(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const raw = req.cookies?.[REFRESH_TOKEN_COOKIE];
        await service.logout(typeof raw === 'string' ? raw : undefined);
        clearSessionCookies(res, env);
        clearCsrfCookie(res, sharedCookieOptions(env));
        res.status(204).end();
      } catch (err) {
        next(err);
      }
    },

    async me(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const subjectId = req.auth?.subjectId;
        if (!subjectId) throw new AppError('Not authenticated', 401, 'unauthenticated');
        const account = await service.getReaderAccount(subjectId);
        if (!account) throw new AppError('Reader not found', 404, 'not_found');
        res.json({ success: true, data: toReaderAccountResponse(account) });
      } catch (err) {
        next(err);
      }
    },
  };
}
