import { describe, expect, it, vi, beforeEach } from 'vitest';
import express from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import type { Database } from '@siders/db';
import type { Env } from '../../config/env.js';
import { createErrorHandler } from '../../middleware/errorHandler.js';
import { __resetRateLimitStoreForTests } from '../../middleware/rateLimit.js';
import { REFRESH_TOKEN_MAX_AGE_MS } from '../../lib/cookies.js';
import { encodeOAuthState, OAUTH_STATE_COOKIE } from '../../lib/oauthState.js';
import type * as CsrfModule from '../../lib/csrf.js';

const setCsrfCookieMock = vi.fn();
vi.mock('../../lib/csrf.js', async (importOriginal) => {
  const actual = await importOriginal<typeof CsrfModule>();
  return { ...actual, setCsrfCookie: (...args: unknown[]) => setCsrfCookieMock(...args) };
});

vi.mock('../../lib/google.js', () => ({
  createAuthorizationRequest: vi.fn(),
  exchangeAuthorizationCode: vi.fn().mockResolvedValue({ id_token: 'idtoken', access_token: 'at' }),
  verifyGoogleIdToken: vi.fn().mockResolvedValue({ sub: 'google-1', email: 'a@b.com', emailVerified: true, name: 'A', avatarUrl: null }),
  assertVerifiedIdentity: vi.fn(),
}));

vi.mock('./reader.repository.js', () => ({
  createReaderRepository: () => ({ upsertByGoogleSub: vi.fn().mockResolvedValue({ id: 'reader-1' }) }),
}));

vi.mock('./session.repository.js', () => ({ createSessionRepository: () => ({}) }));
vi.mock('./auth.service.js', () => ({
  createAuthService: () => ({
    startSession: vi.fn().mockResolvedValue({
      accessToken: 'access',
      refreshToken: 'refresh',
      csrfToken: 'csrf-value',
      sessionId: 'sess-1',
      subjectId: 'reader-1',
      subjectType: 'reader',
    }),
  }),
}));

const ENV = {
  NODE_ENV: 'development',
  COOKIE_DOMAIN: undefined,
  APP_ORIGIN: 'http://localhost:3000',
  ADMIN_ORIGIN: 'http://localhost:5173',
  SESSION_SECRET: 'a'.repeat(32),
} as unknown as Env;

/**
 * The Google callback is one of the three call sites that must pass the CSRF cookie's new
 * `maxAge` (design.md - "this one fix closes the lockout for both audiences"), asserted here
 * against the real, wired-up route.
 */
describe('GET /auth/google/callback', () => {
  beforeEach(() => {
    __resetRateLimitStoreForTests();
    setCsrfCookieMock.mockClear();
  });

  it('issues the CSRF cookie with a maxAge tracking the refresh credential', async () => {
    const { googleAuthRoutes } = await import('./google.routes.js');
    const app = express();
    app.use(express.json());
    app.use(cookieParser());
    app.use('/auth', googleAuthRoutes({} as Database, ENV));
    app.use(createErrorHandler({ warn() {}, error() {}, info() {} } as never));

    const stateCookie = encodeOAuthState({ state: 'state-1', codeVerifier: 'verifier', nonce: 'nonce-1' });

    const res = await request(app)
      .get('/auth/google/callback')
      .query({ state: 'state-1', code: 'auth-code' })
      .set('Cookie', `${OAUTH_STATE_COOKIE}=${stateCookie}`);

    expect(res.status).toBe(302);
    expect(setCsrfCookieMock).toHaveBeenCalledWith(
      expect.anything(),
      'csrf-value',
      expect.objectContaining({ maxAge: REFRESH_TOKEN_MAX_AGE_MS }),
    );
  });
});
