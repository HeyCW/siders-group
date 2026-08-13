import { Router, type Request, type RequestHandler, type Response } from 'express';
import type { Database } from '@siders/db';
import { staffSignInRequestSchema } from '@siders/contracts';
import { createAuthService } from './auth.service.js';
import { createSessionRepository } from './session.repository.js';
import { createAuthController } from './auth.controller.js';
import { createStaffLoginService } from './staffLogin.service.js';
import { createStaffRepository } from '../staff/staff.repository.js';
import { rateLimit, clientIp } from '../../middleware/rateLimit.js';
import { requirePermission, requirePublic, requireReader } from '../../middleware/authorize.js';
import { AppError } from '../../middleware/errorHandler.js';
import { issueCsrfToken, setCsrfCookie } from '../../lib/csrf.js';
import { REFRESH_TOKEN_MAX_AGE_MS, setSessionCookies, sharedCookieOptions } from '../../lib/cookies.js';
import { REFRESH_TOKEN_COOKIE } from '../../lib/tokens.js';
import { sessionMetaFromRequest } from '../../lib/sessionMeta.js';
import type { Env } from '../../config/env.js';

const REFRESH_RATE_LIMIT = { windowMs: 15 * 60 * 1000, max: 30 };
const CSRF_BOOTSTRAP_RATE_LIMIT = { windowMs: 15 * 60 * 1000, max: 30 };
// "5 attempts per 15 minutes per IP-and-email pair" (docs/ARCHITECTURE.md §5.4).
const STAFF_LOGIN_PER_ACCOUNT_LIMIT = { windowMs: 15 * 60 * 1000, max: 5 };
// Per-source cap across every email address, so spraying can't sidestep the per-account cap.
const STAFF_LOGIN_PER_SOURCE_LIMIT = { windowMs: 15 * 60 * 1000, max: 30 };

/** Same AppError, same errorHandler formatting — never a distinct "you're throttled" shape. */
function respondWithGenericFailure(_req: unknown, _res: unknown, next: (err: unknown) => void): void {
  next(new AppError('Invalid email or password', 401, 'invalid_credentials'));
}

/**
 * Refresh's own ordinary failure (`auth.service.ts` - "Invalid refresh token"). Throttling here
 * previously answered 429 while every real rejection answered 401, so the 429 itself told a
 * caller their guesses had been noticed (specs/authentication/spec.md - "Throttling does not
 * leak account existence").
 */
function respondWithRefreshFailure(_req: unknown, _res: unknown, next: (err: unknown) => void): void {
  next(new AppError('Invalid refresh token', 401, 'invalid_refresh_token'));
}

function loginAccountKey(req: Request): string {
  return `${clientIp(req)}:${String(req.body?.email).toLowerCase()}`;
}

/**
 * Both sign-in limits, exported so the scenario tests in `authRateLimit.test.ts` exercise the
 * real configuration rather than a re-declared copy of it. `failuresOnly` because the spec
 * limits *failed* attempts — a staff member signing in from several devices inside one
 * window must not lock themselves out.
 */
export function staffLoginRateLimiters(): RequestHandler[] {
  return [
    rateLimit({
      name: 'staff-login-per-source',
      ...STAFF_LOGIN_PER_SOURCE_LIMIT,
      keyGenerator: clientIp,
      onLimited: respondWithGenericFailure,
      failuresOnly: true,
    }),
    rateLimit({
      name: 'staff-login-per-account',
      ...STAFF_LOGIN_PER_ACCOUNT_LIMIT,
      keyGenerator: loginAccountKey,
      onLimited: respondWithGenericFailure,
      failuresOnly: true,
    }),
  ];
}

/** Exported for the same reason the sign-in chain is: the tests assert the shipped config. */
export function refreshRateLimiter() {
  return rateLimit({
    name: 'auth-refresh',
    ...REFRESH_RATE_LIMIT,
    keyGenerator: clientIp,
    onLimited: respondWithRefreshFailure,
  });
}

/**
 * `GET /auth/csrf`'s own "ordinary" response is always 204 with no body, whichever binding
 * branch fired or none did (specs/authentication/spec.md - "No token is issued when no
 * session is identifiable"). Throttling must stay indistinguishable from that, so a limited
 * caller gets the same uniform 204 — never a cookie, but never a distinct rejection either.
 */
function respondWithCsrfBootstrapNoop(_req: Request, res: Response, _next: (err: unknown) => void): void {
  res.status(204).end();
}

/** Exported for the same reason the sign-in chain is: the tests assert the shipped config. */
export function csrfBootstrapRateLimiter() {
  return rateLimit({
    name: 'auth-csrf-bootstrap',
    ...CSRF_BOOTSTRAP_RATE_LIMIT,
    keyGenerator: clientIp,
    onLimited: respondWithCsrfBootstrapNoop,
  });
}

export function authRoutes(db: Database, env: Env) {
  const router = Router();
  const repository = createSessionRepository(db);
  const service = createAuthService(repository, env);
  const controller = createAuthController(service, env);
  const staffLoginService = createStaffLoginService(createStaffRepository(db));

  router.post(
    '/refresh',
    requirePublic(),
    refreshRateLimiter(),
    controller.refresh,
  );
  router.post('/logout', requirePublic(), controller.logout);
  router.get('/me', requireReader(), controller.me);

  // Re-pairs a CSRF cookie with whichever session the caller's own cookies already identify —
  // recovers a browser caught in the pre-fix lockout (a live `sid_rt` with no `csrf_token`)
  // without rotating a credential, creating a session, or lifting a revocation
  // (design.md - "A safe-method endpoint re-pairs a CSRF cookie for a caller already locked
  // out"). A GET, so `createCsrfMiddleware` never reaches its check for this route.
  router.get(
    '/csrf',
    requirePublic(),
    csrfBootstrapRateLimiter(),
    async (req, res, next) => {
      try {
        let sessionId: string | null = null;
        if (req.auth) {
          sessionId = req.auth.sessionId;
        } else {
          const raw = req.cookies?.[REFRESH_TOKEN_COOKIE];
          if (typeof raw === 'string' && raw.length > 0) {
            sessionId = await service.resolveSessionForCsrfBootstrap(raw);
          }
        }
        if (sessionId) {
          const csrfToken = issueCsrfToken(env, sessionId);
          setCsrfCookie(res, csrfToken, { ...sharedCookieOptions(env), maxAge: REFRESH_TOKEN_MAX_AGE_MS });
        }
        // Uniform regardless of which branch fired, or none did — never an oracle for
        // whether a given browser holds a live session (specs/authentication/spec.md -
        // "No token is issued when no session is identifiable").
        res.status(204).end();
      } catch (err) {
        next(err);
      }
    },
  );

  // System-wide revocation, the incident-response tool the design names in place of signing-key
  // rotation (design.md - Risks: "Signing-key rotation does not end sessions"). Ends the
  // caller's own session too, by design (specs/authentication/spec.md - "Sessions can be
  // revoked in bulk").
  router.post(
    '/sessions/revoke-all',
    requirePermission('settings.manage'),
    async (_req, res, next) => {
      try {
        await service.revokeAll();
        res.status(204).end();
      } catch (err) {
        next(err);
      }
    },
  );

  router.post(
    '/staff/login',
    requirePublic(),
    ...staffLoginRateLimiters(),
    async (req, res, next) => {
      try {
        const body = staffSignInRequestSchema.parse(req.body);
        const { subjectId } = await staffLoginService.login(body.email, body.password);
        const issued = await service.startSession(subjectId, 'staff', sessionMetaFromRequest(req, env));
        setSessionCookies(res, issued, env);
        setCsrfCookie(res, issued.csrfToken, { ...sharedCookieOptions(env), maxAge: REFRESH_TOKEN_MAX_AGE_MS });
        res.status(204).end();
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
