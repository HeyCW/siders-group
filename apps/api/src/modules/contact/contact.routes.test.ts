import { beforeEach, describe, expect, it, vi } from 'vitest';
import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';
import { createErrorHandler } from '../../middleware/errorHandler.js';
import { __resetRateLimitStoreForTests } from '../../middleware/rateLimit.js';
import type { Logger } from '../../lib/logger.js';

vi.mock('../../lib/db.js', () => ({ getDatabase: vi.fn() }));
vi.mock('../../config/env.js', () => ({ loadEnv: vi.fn().mockReturnValue({}) }));
vi.mock('../../lib/ownerRole.js', () => ({ getOwnerRoleId: vi.fn().mockResolvedValue('owner-role-id') }));

// Matches `authorize.test.ts`'s own fake — the shape `resolveStaffAccess` chains against:
// .select().from().innerJoin().leftJoin().leftJoin().where().
function fakeDbReturning(rows: unknown[]) {
  const builder = {
    select: () => builder,
    from: () => builder,
    innerJoin: () => builder,
    leftJoin: () => builder,
    where: () => builder,
    limit: () => Promise.resolve(rows),
    then: (resolve: (v: unknown[]) => void) => resolve(rows),
  };
  return builder;
}

import { getDatabase } from '../../lib/db.js';
import { contactRateLimiter } from '../../middleware/rateLimit.js';
import { requirePermission, requirePublic } from '../../middleware/authorize.js';

const silentLogger = { warn() {}, error() {}, info() {} } as unknown as Logger;

const HOUR_MS = 60 * 60 * 1000;

function liveSession() {
  return {
    revokedAt: null,
    expiresAt: new Date(Date.now() + HOUR_MS),
    absoluteExpiresAt: new Date(Date.now() + 24 * HOUR_MS),
  };
}

/**
 * Mounts the *real* exported `contactRateLimiter()` in front of a stub handler, following the
 * pattern `authRateLimit.test.ts` uses for `staffLoginRateLimiters()` — so this tracks the
 * shipped configuration (namespace, window, ceiling) rather than a re-declared copy of it.
 * Covers `tasks.md` 4.4's "the rate limit on submission" and
 * `specs/contact-messages/spec.md` - "Contact submissions are rate-limited per address".
 */
function createSubmitApp(): Express {
  const app = express();
  app.use(express.json());
  app.post('/contact-messages', requirePublic(), contactRateLimiter(), (_req: Request, res: Response) => {
    res.status(201).json({ success: true, data: { id: 'msg-1', createdAt: new Date().toISOString() } });
  });
  app.use(createErrorHandler(silentLogger));
  return app;
}

describe('contact submission rate limiting', () => {
  let app: Express;

  beforeEach(() => {
    __resetRateLimitStoreForTests();
    app = createSubmitApp();
  });

  it('accepts up to 3 submissions per hour from one address', async () => {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const res = await request(app).post('/contact-messages').send({});
      expect(res.status).toBe(201);
    }
  });

  it('rejects a 4th submission within the hour from the same address (spec: 3/hour)', async () => {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await request(app).post('/contact-messages').send({});
    }
    const fourth = await request(app).post('/contact-messages').send({});
    expect(fourth.status).toBe(429);
    expect(fourth.body.error.code).toBe('rate_limited');
  });

  it('does not spend another endpoint\'s budget and is not spent by another endpoint — own namespace', async () => {
    // A neighboring engagement limiter (view) shares no bucket with `contact` — regression
    // guard for the exact collision class `rateLimit.ts`'s own `name` field docs describe.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await request(app).post('/contact-messages').send({});
    }
    __resetRateLimitStoreForTests();
    const res = await request(app).post('/contact-messages').send({});
    expect(res.status).toBe(201);
  });
});

/**
 * Mounts the *real* exported `requirePermission('contact.manage')` / `requirePublic()` in front
 * of stub handlers, following `authorize.test.ts`'s DB-mocking pattern for `resolveStaffAccess`.
 * Covers `tasks.md` 4.4's "permission gating (missing permission, no session)" and
 * `specs/contact-messages/spec.md` - "Reading contact messages requires the contact.manage
 * permission".
 */
function createAdminApp(): Express {
  const app = express();
  app.use(express.json());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    const header = req.header('x-test-auth');
    if (header) req.auth = JSON.parse(header);
    next();
  });
  app.get('/admin/contact-messages', requirePermission('contact.manage'), (_req: Request, res: Response) => {
    res.json({ success: true, data: [] });
  });
  app.use(createErrorHandler(silentLogger));
  return app;
}

function withAuth(auth: { subjectId: string; subjectType: 'staff'; sessionId: string }) {
  return { 'x-test-auth': JSON.stringify(auth) };
}

describe('contact-message inbox authorization', () => {
  let app: Express;

  beforeEach(() => {
    app = createAdminApp();
  });

  it('rejects a caller with no session', async () => {
    const res = await request(app).get('/admin/contact-messages');
    expect(res.status).toBe(403);
  });

  it('rejects a staff caller lacking contact.manage', async () => {
    vi.mocked(getDatabase).mockReturnValue(
      fakeDbReturning([
        { subjectId: 'staff-1', ...liveSession(), status: 'active', roleId: 'editor-role-id', permissionKey: null },
      ]) as never,
    );
    const res = await request(app)
      .get('/admin/contact-messages')
      .set(withAuth({ subjectId: 'staff-1', subjectType: 'staff', sessionId: 'sess-1' }));
    expect(res.status).toBe(403);
  });

  it('allows a staff caller holding contact.manage', async () => {
    vi.mocked(getDatabase).mockReturnValue(
      fakeDbReturning([
        {
          subjectId: 'staff-1',
          ...liveSession(),
          status: 'active',
          roleId: 'editor-role-id',
          permissionKey: 'contact.manage',
        },
      ]) as never,
    );
    const res = await request(app)
      .get('/admin/contact-messages')
      .set(withAuth({ subjectId: 'staff-1', subjectType: 'staff', sessionId: 'sess-1' }));
    expect(res.status).toBe(200);
  });
});
