import { describe, expect, it, vi } from 'vitest';
import type { NextFunction, Request, Response } from 'express';
import { createAuthController } from './auth.controller.js';
import type { AuthService, IssuedSession } from './auth.service.js';
import { CSRF_COOKIE } from '../../lib/csrf.js';
import { REFRESH_TOKEN_MAX_AGE_MS } from '../../lib/cookies.js';
import { REFRESH_TOKEN_COOKIE } from '../../lib/tokens.js';

const ENV = {
  NODE_ENV: 'development' as const,
  COOKIE_DOMAIN: undefined,
  APP_ORIGIN: 'http://localhost:3000',
  SESSION_SECRET: 'a'.repeat(32),
};

function issued(): IssuedSession {
  return {
    accessToken: 'access',
    refreshToken: 'refresh',
    csrfToken: 'csrf-value',
    sessionId: 'sess-1',
    subjectId: 'staff-1',
    subjectType: 'staff',
  };
}

function makeRes() {
  return { cookie: vi.fn(), clearCookie: vi.fn(), status: vi.fn().mockReturnThis(), end: vi.fn(), json: vi.fn() } as unknown as Response & {
    cookie: ReturnType<typeof vi.fn>;
    clearCookie: ReturnType<typeof vi.fn>;
  };
}

/**
 * `POST /auth/refresh` is one of the three call sites that must pass the CSRF cookie's new
 * `maxAge` (design.md - "CSRF cookie lifetime tracks the refresh cookie's"). Asserted at the
 * controller, not just on `setCsrfCookie` itself, so a future call site that forgets to pass
 * it is caught here rather than only in a unit test of the helper.
 */
describe('authController.refresh', () => {
  it('issues the CSRF cookie with a maxAge tracking the refresh credential, so it survives a browser restart', async () => {
    const service = { refresh: vi.fn().mockResolvedValue(issued()) } as unknown as AuthService;
    const controller = createAuthController(service, ENV);
    const req = { cookies: { [REFRESH_TOKEN_COOKIE]: 'raw-refresh' }, get: () => undefined } as unknown as Request;
    const res = makeRes();
    const next = vi.fn();

    await controller.refresh(req, res, next as NextFunction);

    expect(next).not.toHaveBeenCalled();
    const csrfCall = res.cookie.mock.calls.find(([name]) => name === CSRF_COOKIE);
    expect(csrfCall?.[2]).toMatchObject({ maxAge: REFRESH_TOKEN_MAX_AGE_MS });
  });

  it('logout clears the CSRF cookie unaffected by the maxAge change', async () => {
    const service = { logout: vi.fn().mockResolvedValue(undefined) } as unknown as AuthService;
    const controller = createAuthController(service, ENV);
    const req = { cookies: {}, auth: { subjectId: 'staff-1', subjectType: 'staff', sessionId: 'sess-1' } } as unknown as Request;
    const res = makeRes();
    const next = vi.fn();

    await controller.logout(req, res, next as NextFunction);

    expect(next).not.toHaveBeenCalled();
    const csrfClearCall = res.clearCookie.mock.calls.find(([name]) => name === CSRF_COOKIE);
    expect(csrfClearCall).toBeDefined();
    expect((csrfClearCall?.[1] as Record<string, unknown>).maxAge).toBeUndefined();
  });
});
