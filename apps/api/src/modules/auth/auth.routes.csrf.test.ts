import { describe, expect, it, vi, beforeEach } from 'vitest';
import express, { type NextFunction, type Request, type Response } from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import type { Database } from '@siders/db';
import type { Env } from '../../config/env.js';
import { createErrorHandler } from '../../middleware/errorHandler.js';
import { __resetRateLimitStoreForTests } from '../../middleware/rateLimit.js';
import { REFRESH_TOKEN_MAX_AGE_MS } from '../../lib/cookies.js';
import { CSRF_HEADER, createCsrfMiddleware, verifyCsrfToken } from '../../lib/csrf.js';
import type * as CsrfModule from '../../lib/csrf.js';
import { REFRESH_TOKEN_COOKIE } from '../../lib/tokens.js';

const setCsrfCookieMock = vi.fn();
vi.mock('../../lib/csrf.js', async (importOriginal) => {
  const actual = await importOriginal<typeof CsrfModule>();
  return { ...actual, setCsrfCookie: (...args: unknown[]) => setCsrfCookieMock(...args) };
});

const resolveSessionForCsrfBootstrapMock = vi.fn();
const startSessionMock = vi.fn();
const refreshMock = vi.fn();

vi.mock('../staff/staff.repository.js', () => ({ createStaffRepository: () => ({}) }));
vi.mock('./staffLogin.service.js', () => ({ createStaffLoginService: () => ({ login: vi.fn() }) }));
vi.mock('./session.repository.js', () => ({ createSessionRepository: () => ({}) }));
vi.mock('./auth.service.js', () => ({
  createAuthService: () => ({
    startSession: startSessionMock,
    refresh: refreshMock,
    revokeAll: vi.fn(),
    resolveSessionForCsrfBootstrap: resolveSessionForCsrfBootstrapMock,
  }),
}));

const ENV = {
  NODE_ENV: 'development',
  COOKIE_DOMAIN: undefined,
  APP_ORIGIN: 'http://localhost:3000',
  SESSION_SECRET: 'a'.repeat(32),
} as unknown as Env;

/** Attaches `req.auth` before the router, standing in for the global `authenticate` middleware. */
function appWithAuth(auth?: { subjectId: string; subjectType: 'staff' | 'reader'; sessionId: string }) {
  return async () => {
    const { authRoutes } = await import('./auth.routes.js');
    const app = express();
    app.use(express.json());
    app.use(cookieParser());
    app.use((req: Request, _res: Response, next: NextFunction) => {
      if (auth) req.auth = auth;
      next();
    });
    app.use('/auth', authRoutes({} as Database, ENV));
    app.use(createErrorHandler({ warn() {}, error() {}, info() {} } as never));
    return app;
  };
}

describe('GET /auth/csrf', () => {
  beforeEach(() => {
    __resetRateLimitStoreForTests();
    setCsrfCookieMock.mockClear();
    resolveSessionForCsrfBootstrapMock.mockReset();
    startSessionMock.mockReset();
    refreshMock.mockReset();
  });

  it('recovers using only a refresh credential (sid_rt), issuing a cookie bound to that session', async () => {
    resolveSessionForCsrfBootstrapMock.mockResolvedValue('sess-from-refresh');
    const app = await appWithAuth()();

    const res = await request(app).get('/auth/csrf').set('Cookie', `${REFRESH_TOKEN_COOKIE}=raw-refresh-token`);

    expect(res.status).toBe(204);
    expect(res.body).toEqual({});
    expect(resolveSessionForCsrfBootstrapMock).toHaveBeenCalledWith('raw-refresh-token');
    expect(setCsrfCookieMock).toHaveBeenCalledTimes(1);
    const [, token, options] = setCsrfCookieMock.mock.calls[0] as [unknown, string, Record<string, unknown>];
    expect(options).toMatchObject({ maxAge: REFRESH_TOKEN_MAX_AGE_MS });
    expect(verifyCsrfToken(token, ENV)).toEqual({ sessionId: 'sess-from-refresh' });
  });

  it('recovers using a valid access credential (sid_at), binding to its session and preferring it over sid_rt', async () => {
    const app = await appWithAuth({ subjectId: 'staff-1', subjectType: 'staff', sessionId: 'sess-from-access' })();

    const res = await request(app).get('/auth/csrf').set('Cookie', `${REFRESH_TOKEN_COOKIE}=raw-refresh-token`);

    expect(res.status).toBe(204);
    // req.auth took precedence — the sid_rt lookup was never consulted.
    expect(resolveSessionForCsrfBootstrapMock).not.toHaveBeenCalled();
    expect(setCsrfCookieMock).toHaveBeenCalledTimes(1);
    const [, token] = setCsrfCookieMock.mock.calls[0] as [unknown, string, Record<string, unknown>];
    expect(verifyCsrfToken(token, ENV)).toEqual({ sessionId: 'sess-from-access' });
  });

  /**
   * The window a `sid_rt`-only fix would miss (design.md): `sid_at` is itself persistent, so a
   * restart inside its 15-minute window can leave a valid `sid_at` with no CSRF cookie at all.
   * `createCsrfMiddleware`'s binding check *is* enforced whenever `req.auth` is set, so the
   * re-issued token must actually pass it on the caller's next state-changing request.
   */
  it('the recovered cookie passes createCsrfMiddleware\'s binding check on a subsequent request', async () => {
    const sessionId = 'sess-from-access';
    const app = await appWithAuth({ subjectId: 'staff-1', subjectType: 'staff', sessionId })();

    await request(app).get('/auth/csrf');
    const [, token] = setCsrfCookieMock.mock.calls[0] as [unknown, string, Record<string, unknown>];

    const middleware = createCsrfMiddleware(ENV);
    const next = vi.fn();
    const followUpReq = {
      method: 'POST',
      cookies: { [REFRESH_TOKEN_COOKIE]: 'irrelevant', csrf_token: token },
      auth: { subjectId: 'staff-1', subjectType: 'staff' as const, sessionId },
      get: (name: string) => (name.toLowerCase() === CSRF_HEADER ? token : undefined),
    } as unknown as Request;
    middleware(followUpReq, {} as Response, next as NextFunction);

    expect(next).toHaveBeenCalledWith();
  });

  /**
   * specs/authentication/spec.md - "A token may be issued for a session revoked since the
   * access credential was signed": the access-credential branch binds on signature alone
   * (`authenticate.ts` — no database read), so it has no way to know, or care, whether the
   * session it names has since been revoked. `resolveSessionForCsrfBootstrapMock` — the only
   * DB-touching call this route makes — is asserted un-called, which is exactly why revocation
   * cannot gate this branch. The revocation itself stays enforced downstream, independently, by
   * `resolveStaffAccess` (`authorize.test.ts` — "rejects a revoked session"); this endpoint
   * having run changes nothing about that check.
   */
  it('issues a token via a valid access credential even when its session has since been revoked, since this branch never checks', async () => {
    const app = await appWithAuth({ subjectId: 'staff-1', subjectType: 'staff', sessionId: 'sess-revoked' })();

    const res = await request(app).get('/auth/csrf');

    expect(res.status).toBe(204);
    expect(resolveSessionForCsrfBootstrapMock).not.toHaveBeenCalled();
    expect(setCsrfCookieMock).toHaveBeenCalledTimes(1);
    const [, token] = setCsrfCookieMock.mock.calls[0] as [unknown, string, Record<string, unknown>];
    expect(verifyCsrfToken(token, ENV)).toEqual({ sessionId: 'sess-revoked' });
  });

  it('issues no token when no session is identifiable — no cookies at all', async () => {
    const app = await appWithAuth()();

    const res = await request(app).get('/auth/csrf');

    expect(res.status).toBe(204);
    expect(res.body).toEqual({});
    expect(setCsrfCookieMock).not.toHaveBeenCalled();
  });

  it('issues no token for a revoked or expired refresh credential', async () => {
    resolveSessionForCsrfBootstrapMock.mockResolvedValue(null);
    const app = await appWithAuth()();

    const res = await request(app).get('/auth/csrf').set('Cookie', `${REFRESH_TOKEN_COOKIE}=stale-token`);

    expect(res.status).toBe(204);
    expect(res.body).toEqual({});
    expect(setCsrfCookieMock).not.toHaveBeenCalled();
  });

  it('never derives binding from a query parameter, header, or body', async () => {
    const app = await appWithAuth()();

    const res = await request(app)
      .get('/auth/csrf')
      .query({ sessionId: 'attacker-supplied' })
      .set('x-session-id', 'attacker-supplied');

    expect(res.status).toBe(204);
    expect(setCsrfCookieMock).not.toHaveBeenCalled();
  });

  it('never rotates a refresh credential, creates a session, or lifts a revocation', async () => {
    resolveSessionForCsrfBootstrapMock.mockResolvedValue('sess-1');
    const app = await appWithAuth()();

    await request(app).get('/auth/csrf').set('Cookie', `${REFRESH_TOKEN_COOKIE}=raw-refresh-token`);

    expect(startSessionMock).not.toHaveBeenCalled();
    expect(refreshMock).not.toHaveBeenCalled();
  });

  /**
   * specs/authentication/spec.md - "Repeated CSRF re-pairing calls are throttled": the
   * rejection must be indistinguishable from the endpoint's own uniform 204, so a throttled
   * caller who otherwise would have recovered still gets 204 with no cookie.
   */
  it('rate limits the endpoint, indistinguishably from its own uniform 204 response', async () => {
    resolveSessionForCsrfBootstrapMock.mockResolvedValue('sess-1');
    const app = await appWithAuth()();

    let lastStatus = 0;
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const res = await request(app).get('/auth/csrf').set('Cookie', `${REFRESH_TOKEN_COOKIE}=raw-refresh-token`);
      lastStatus = res.status;
    }
    expect(lastStatus).toBe(204);
    setCsrfCookieMock.mockClear();

    const throttled = await request(app).get('/auth/csrf').set('Cookie', `${REFRESH_TOKEN_COOKIE}=raw-refresh-token`);

    expect(throttled.status).toBe(204);
    expect(throttled.body).toEqual({});
    // Throttled: even though the credential would otherwise have resolved, no cookie is set.
    expect(setCsrfCookieMock).not.toHaveBeenCalled();
  });

  /**
   * design.md - "That forced GET is nonetheless chargeable": the limiter is keyed on the
   * presented refresh credential, not bare source IP, so a hostile page forcing credential-less
   * requests — or many staff members recovering behind one shared NAT — cannot spend one
   * caller's budget against another's. Two distinct `sid_rt` values from what `supertest`
   * treats as the same client exhaust two separate budgets, not one shared one.
   */
  it('keys the rate limit on the presented refresh credential, not on source address, so one caller cannot exhaust another\'s budget', async () => {
    resolveSessionForCsrfBootstrapMock.mockResolvedValue('sess-1');
    const app = await appWithAuth()();

    for (let attempt = 0; attempt < 30; attempt += 1) {
      await request(app).get('/auth/csrf').set('Cookie', `${REFRESH_TOKEN_COOKIE}=credential-a`);
    }
    setCsrfCookieMock.mockClear();

    // credential-a is now throttled...
    const throttledA = await request(app).get('/auth/csrf').set('Cookie', `${REFRESH_TOKEN_COOKIE}=credential-a`);
    expect(throttledA.status).toBe(204);
    expect(setCsrfCookieMock).not.toHaveBeenCalled();

    // ...but credential-b, from the same request-issuing client, has its own untouched budget.
    const stillWorksB = await request(app).get('/auth/csrf').set('Cookie', `${REFRESH_TOKEN_COOKIE}=credential-b`);
    expect(stillWorksB.status).toBe(204);
    expect(setCsrfCookieMock).toHaveBeenCalledTimes(1);
  });

  /**
   * The fallback for a caller presenting no refresh credential at all — the only case bare
   * `clientIp` keying is still correct for, since there is nothing else to key on. Uses the
   * access-credential branch (no `sid_rt` cookie sent) so a throttled request is observably
   * different from a healthy one: the key generator only inspects `sid_rt`, so it falls back to
   * `clientIp` here even though `req.auth` is what actually resolves the binding.
   */
  it('falls back to source address, and still throttles, when no refresh credential is presented', async () => {
    const app = await appWithAuth({ subjectId: 'staff-1', subjectType: 'staff', sessionId: 'sess-ip-fallback' })();

    let lastStatus = 0;
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const res = await request(app).get('/auth/csrf');
      lastStatus = res.status;
    }
    expect(lastStatus).toBe(204);
    expect(setCsrfCookieMock).toHaveBeenCalledTimes(30);
    setCsrfCookieMock.mockClear();

    const throttled = await request(app).get('/auth/csrf');
    expect(throttled.status).toBe(204);
    expect(throttled.body).toEqual({});
    expect(setCsrfCookieMock).not.toHaveBeenCalled();
  });
});
