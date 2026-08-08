import type { NextFunction, Request, Response } from 'express';
import type { Env } from '../config/env.js';
import { verifyAccessToken, type AccessTokenClaims } from '../lib/tokens.js';

export type AuthContext = AccessTokenClaims;

declare module 'express-serve-static-core' {
  interface Request {
    auth?: AuthContext;
  }
}

export const ACCESS_TOKEN_COOKIE = 'sid_at';

export type AuthenticateEnv = Pick<Env, 'ACCESS_TOKEN_PRIVATE_KEY' | 'ACCESS_TOKEN_PUBLIC_KEY'>;

/**
 * Identifies the caller and nothing else. Missing, invalid, or expired credentials are all
 * anonymous — never an error; rejecting a caller is exclusively authorization's job
 * (`authorize.ts`). Verification is local EdDSA only — no database read on this path
 * (docs/ARCHITECTURE.md §5.5, specs/authentication/spec.md - "Authentication only
 * identifies, never authorizes").
 */
export function createAuthenticate(env: AuthenticateEnv) {
  return async function authenticate(req: Request, _res: Response, next: NextFunction): Promise<void> {
    const token = req.cookies?.[ACCESS_TOKEN_COOKIE];
    if (typeof token === 'string' && token.length > 0) {
      try {
        req.auth = await verifyAccessToken(token, env);
      } catch {
        /* expired or invalid — treated as anonymous, client will refresh */
      }
    }
    next();
  };
}
