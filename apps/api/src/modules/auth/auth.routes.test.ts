import { describe, expect, it, vi, beforeEach } from 'vitest';
import express from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import type { Database } from '@siders/db';
import type { Env } from '../../config/env.js';
import { createErrorHandler } from '../../middleware/errorHandler.js';
import { __resetRateLimitStoreForTests } from '../../middleware/rateLimit.js';
import { REFRESH_TOKEN_MAX_AGE_MS } from '../../lib/cookies.js';
import type * as CsrfModule from '../../lib/csrf.js';

const setCsrfCookieMock = vi.fn();
vi.mock('../../lib/csrf.js', async (importOriginal) => {
  const actual = await importOriginal<typeof CsrfModule>();
  return { ...actual, setCsrfCookie: (...args: unknown[]) => setCsrfCookieMock(...args) };
});

const startSessionMock = vi.fn().mockResolvedValue({
  accessToken: 'access',
  refreshToken: 'refresh',
  csrfToken: 'csrf-value',
  sessionId: 'sess-1',
  subjectId: 'staff-1',
  subjectType: 'staff',
});

vi.mock('../staff/staff.repository.js', () => ({ createStaffRepository: () => ({}) }));
vi.mock('./staffLogin.service.js', () => ({
  createStaffLoginService: () => ({ login: vi.fn().mockResolvedValue({ subjectId: 'staff-1' }) }),
}));
vi.mock('./session.repository.js', () => ({ createSessionRepository: () => ({}) }));
vi.mock('./auth.service.js', () => ({
  createAuthService: () => ({ startSession: startSessionMock, revokeAll: vi.fn() }),
}));

const ENV = {
  NODE_ENV: 'development',
  COOKIE_DOMAIN: undefined,
  APP_ORIGIN: 'http://localhost:3000',
  SESSION_SECRET: 'a'.repeat(32),
} as unknown as Env;

/**
 * Staff login is one of the three call sites that must pass the CSRF cookie's new `maxAge`
 * (design.md - "CSRF cookie lifetime tracks the refresh cookie's"), asserted here against the
 * real, wired-up route rather than against `setCsrfCookie` in isolation.
 */
describe('POST /auth/staff/login', () => {
  beforeEach(async () => {
    __resetRateLimitStoreForTests();
    setCsrfCookieMock.mockClear();
  });

  it('issues the CSRF cookie with a maxAge tracking the refresh credential', async () => {
    const { authRoutes } = await import('./auth.routes.js');
    const app = express();
    app.use(express.json());
    app.use(cookieParser());
    app.use('/auth', authRoutes({} as Database, ENV));
    app.use(createErrorHandler({ warn() {}, error() {}, info() {} } as never));

    const res = await request(app).post('/auth/staff/login').send({ email: 'a@b.com', password: 'whatever1' });

    expect(res.status).toBe(204);
    expect(setCsrfCookieMock).toHaveBeenCalledWith(
      expect.anything(),
      'csrf-value',
      expect.objectContaining({ maxAge: REFRESH_TOKEN_MAX_AGE_MS }),
    );
  });
});
