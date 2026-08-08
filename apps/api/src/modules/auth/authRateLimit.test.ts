import { beforeEach, describe, expect, it } from 'vitest';
import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';
import { AppError, createErrorHandler } from '../../middleware/errorHandler.js';
import { __resetRateLimitStoreForTests } from '../../middleware/rateLimit.js';
import { staffLoginRateLimiters } from './auth.routes.js';
import { passwordChangeRateLimiter } from '../staff/staff.routes.js';
import type { Logger } from '../../lib/logger.js';

const silentLogger = { warn() {}, error() {}, info() {} } as unknown as Logger;

const GENERIC_FAILURE = { code: 'invalid_credentials', message: 'Invalid email or password' };

/**
 * Mounts the *real* exported limiter chains in front of a stub handler, so these assertions
 * track the shipped configuration (keys, ceilings, `onLimited`, `failuresOnly`) rather than a
 * re-declared copy of it. Covers the endpoint-level scenarios in
 * specs/authentication/spec.md - "Authentication attempts are rate limited"; the mechanism
 * itself is covered in middleware/rateLimit.test.ts.
 */
function createLoginApp(): Express {
  const app = express();
  app.use(express.json());
  app.post('/staff/login', ...staffLoginRateLimiters(), (req: Request, res: Response, next: NextFunction) => {
    if (req.body?.password === 'correct-password') {
      res.status(204).end();
      return;
    }
    next(new AppError(GENERIC_FAILURE.message, 401, GENERIC_FAILURE.code));
  });
  app.use(createErrorHandler(silentLogger));
  return app;
}

/**
 * `passwordChangeRateLimiter()` keys on `req.auth.subjectId` rather than source address —
 * this endpoint is authenticated, so the test stands in for `authenticate` by attaching
 * `req.auth` from the request body before the limiter runs.
 */
function createPasswordChangeApp(): Express {
  const app = express();
  app.use(express.json());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    req.auth = { subjectId: req.body?.subjectId, subjectType: 'staff', sessionId: 'sess-1' };
    next();
  });
  app.post('/staff/me/password', passwordChangeRateLimiter(), (req: Request, res: Response, next: NextFunction) => {
    if (req.body?.currentPassword === 'correct-current') {
      res.status(204).end();
      return;
    }
    next(new AppError('Current password is incorrect', 401, 'invalid_credentials'));
  });
  app.use(createErrorHandler(silentLogger));
  return app;
}

function login(app: Express, email: string, password = 'wrong-password') {
  return request(app).post('/staff/login').send({ email, password });
}

describe('sign-in rate limiting', () => {
  let app: Express;

  beforeEach(() => {
    __resetRateLimitStoreForTests();
    app = createLoginApp();
  });

  it('throttles repeated failures for one account, even once the credentials become correct', async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const res = await login(app, 'target@example.com');
      expect(res.status).toBe(401);
    }

    // The 6th attempt carries the *correct* password and is still refused
    // (spec: "further attempts are rejected regardless of whether the submitted credentials
    // would otherwise be correct").
    const res = await login(app, 'target@example.com', 'correct-password');
    expect(res.status).toBe(401);
    expect(res.body.error).toMatchObject(GENERIC_FAILURE);
  });

  it('does not count successful sign-ins against the limit', async () => {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const res = await login(app, 'target@example.com', 'correct-password');
      expect(res.status).toBe(204);
    }

    // Well past the 5-attempt ceiling, yet nothing was ever a failed attempt.
    const res = await login(app, 'target@example.com', 'correct-password');
    expect(res.status).toBe(204);
  });

  it('throttles password spraying, where no single account exceeds the per-account limit', async () => {
    // 30 distinct addresses, each seeing far fewer than 5 failures, so only the per-source
    // cap can catch this.
    for (let i = 0; i < 30; i += 1) {
      const res = await login(app, `victim-${i}@example.com`);
      expect(res.status).toBe(401);
    }

    const res = await login(app, 'victim-30@example.com', 'correct-password');
    expect(res.status).toBe(401);
    expect(res.body.error).toMatchObject(GENERIC_FAILURE);
  });

  it('returns a throttled response indistinguishable from an ordinary failure', async () => {
    const ordinaryFailure = await login(app, 'target@example.com');
    for (let attempt = 0; attempt < 4; attempt += 1) await login(app, 'target@example.com');

    const throttled = await login(app, 'target@example.com');

    expect(throttled.status).toBe(ordinaryFailure.status);
    expect(throttled.body).toEqual(ordinaryFailure.body);
    // Never a 429, and never a Retry-After that would give the throttling away.
    expect(throttled.status).not.toBe(429);
    expect(throttled.headers['retry-after']).toBeUndefined();
  });
});

describe('password-change rate limiting', () => {
  let app: Express;

  beforeEach(() => {
    __resetRateLimitStoreForTests();
    app = createPasswordChangeApp();
  });

  it('throttles repeated wrong-current-password guesses from one account', async () => {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const res = await request(app)
        .post('/staff/me/password')
        .send({ subjectId: 'staff-1', currentPassword: `guess-${attempt}` });
      expect(res.status).toBe(401);
    }

    const res = await request(app)
      .post('/staff/me/password')
      .send({ subjectId: 'staff-1', currentPassword: 'correct-current' });
    expect(res.status).toBe(429);
  });

  it('does not spend the budget on a current password that verifies', async () => {
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const res = await request(app)
        .post('/staff/me/password')
        .send({ subjectId: 'staff-1', currentPassword: 'correct-current' });
      expect(res.status).toBe(204);
    }
  });

  it('keys on the caller\'s account, so one staff member\'s failures do not throttle another', async () => {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      await request(app).post('/staff/me/password').send({ subjectId: 'staff-1', currentPassword: 'wrong' });
    }

    const res = await request(app)
      .post('/staff/me/password')
      .send({ subjectId: 'staff-2', currentPassword: 'correct-current' });
    expect(res.status).toBe(204);
  });
});
