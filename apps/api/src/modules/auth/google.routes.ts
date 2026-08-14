import { Router, type NextFunction, type Request, type Response } from 'express';
import type { Database } from '@siders/db';
import type { Env } from '../../config/env.js';
import { AppError } from '../../middleware/errorHandler.js';
import { requirePublic } from '../../middleware/authorize.js';
import { rateLimit, clientIp } from '../../middleware/rateLimit.js';
import {
  assertVerifiedIdentity,
  createAuthorizationRequest,
  exchangeAuthorizationCode,
  verifyGoogleIdToken,
} from '../../lib/google.js';
import {
  decodeOAuthState,
  encodeOAuthState,
  OAUTH_STATE_COOKIE,
  OAUTH_STATE_TTL_MS,
} from '../../lib/oauthState.js';
import { resolveRedirectTarget } from '../../lib/redirect.js';
import { sessionMetaFromRequest } from '../../lib/sessionMeta.js';
import { setCsrfCookie } from '../../lib/csrf.js';
import { REFRESH_TOKEN_MAX_AGE_MS, setSessionCookies, sharedCookieOptions } from '../../lib/cookies.js';
import { createAuthService } from './auth.service.js';
import { createSessionRepository } from './session.repository.js';
import { createReaderRepository } from './reader.repository.js';

const CALLBACK_RATE_LIMIT = { windowMs: 15 * 60 * 1000, max: 20 };

/**
 * The callback's own ordinary failure — the same 400 a mismatched or absent `state` produces
 * below. A 429 here would single out the throttled caller against every other rejection
 * (specs/authentication/spec.md - "Throttling does not leak account existence").
 */
function respondWithCallbackFailure(_req: Request, _res: Response, next: NextFunction): void {
  next(new AppError('Missing or expired sign-in state', 400, 'invalid_oauth_state'));
}

/** Exported for the same reason the sign-in chain is: the tests assert the shipped config. */
export function googleCallbackRateLimiter() {
  return rateLimit({
    name: 'google-callback',
    ...CALLBACK_RATE_LIMIT,
    keyGenerator: clientIp,
    onLimited: respondWithCallbackFailure,
  });
}

export function googleAuthRoutes(db: Database, env: Env) {
  const router = Router();
  const readerRepository = createReaderRepository(db);
  const authService = createAuthService(createSessionRepository(db), env);

  router.get('/google', requirePublic(), (req: Request, res: Response) => {
    const request = createAuthorizationRequest(env);
    const next = typeof req.query.next === 'string' ? req.query.next : undefined;
    const cookieValue = encodeOAuthState({
      state: request.state,
      codeVerifier: request.codeVerifier,
      nonce: request.nonce,
      next,
    });
    res.cookie(OAUTH_STATE_COOKIE, cookieValue, {
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      sameSite: 'lax', // survives the redirect back from Google
      maxAge: OAUTH_STATE_TTL_MS,
      path: '/',
    });
    res.redirect(request.url);
  });

  router.get(
    '/google/callback',
    requirePublic(),
    googleCallbackRateLimiter(),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const cookieValue = req.cookies?.[OAUTH_STATE_COOKIE];
        // Single-use: clear immediately so a replayed callback finds nothing to validate
        // against (specs/authentication/spec.md - "Replayed callback is rejected").
        res.clearCookie(OAUTH_STATE_COOKIE, { path: '/' });

        const bound = typeof cookieValue === 'string' ? decodeOAuthState(cookieValue) : null;
        if (!bound) {
          throw new AppError('Missing or expired sign-in state', 400, 'invalid_oauth_state');
        }

        const returnedState = typeof req.query.state === 'string' ? req.query.state : undefined;
        if (!returnedState || returnedState !== bound.state) {
          throw new AppError('Sign-in state does not match', 400, 'invalid_oauth_state');
        }

        const code = typeof req.query.code === 'string' ? req.query.code : undefined;
        if (!code) {
          throw new AppError('Missing authorization code', 400, 'invalid_oauth_callback');
        }

        // Google's own access/refresh tokens live only in this local variable and are
        // discarded once the identity is verified — never stored (docs/ARCHITECTURE.md §5.2).
        const googleTokens = await exchangeAuthorizationCode(env, code, bound.codeVerifier);
        const identity = await verifyGoogleIdToken(googleTokens.id_token, env, bound.nonce);
        assertVerifiedIdentity(identity);

        const reader = await readerRepository.upsertByGoogleSub({
          googleSub: identity.sub,
          email: identity.email,
          emailVerified: identity.emailVerified,
          name: identity.name,
          avatarUrl: identity.avatarUrl,
        });

        const issued = await authService.startSession(reader.id, 'reader', sessionMetaFromRequest(req, env));
        setSessionCookies(res, issued, env);
        setCsrfCookie(res, issued.csrfToken, { ...sharedCookieOptions(env), maxAge: REFRESH_TOKEN_MAX_AGE_MS });

        res.redirect(resolveRedirectTarget(bound.next, env));
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
