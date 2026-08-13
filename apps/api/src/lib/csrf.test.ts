import { describe, expect, it, vi } from 'vitest';
import type { NextFunction, Request, Response } from 'express';
import {
  CSRF_COOKIE,
  CSRF_HEADER,
  clearCsrfCookie,
  createCsrfMiddleware,
  issueCsrfToken,
  setCsrfCookie,
  verifyCsrfToken,
  type CsrfEnv,
} from './csrf.js';
import { REFRESH_TOKEN_MAX_AGE_MS } from './cookies.js';
import { ACCESS_TOKEN_COOKIE } from '../middleware/authenticate.js';
import type { AuthContext } from '../middleware/authenticate.js';

const env: CsrfEnv = { SESSION_SECRET: 'a'.repeat(32) };
const SESSION_ID = 'sess-1';

function staffAuth(sessionId: string): AuthContext {
  return { subjectId: 'staff-1', subjectType: 'staff', sessionId };
}

function makeReq(opts: {
  method?: string;
  cookies?: Record<string, string>;
  header?: string;
  auth?: AuthContext;
}): Request {
  return {
    method: opts.method ?? 'POST',
    cookies: opts.cookies ?? {},
    auth: opts.auth,
    get: (name: string) => (name.toLowerCase() === CSRF_HEADER ? opts.header : undefined),
  } as unknown as Request;
}

describe('issueCsrfToken / verifyCsrfToken', () => {
  it('verifies a token it issued and reports the session it is bound to', () => {
    const token = issueCsrfToken(env, SESSION_ID);
    expect(verifyCsrfToken(token, env)).toEqual({ sessionId: SESSION_ID });
  });

  it('rejects a token signed with a different secret', () => {
    const token = issueCsrfToken({ SESSION_SECRET: 'b'.repeat(32) }, SESSION_ID);
    expect(verifyCsrfToken(token, env)).toBeNull();
  });

  it('rejects a token whose bound session was swapped after signing', () => {
    const token = issueCsrfToken(env, SESSION_ID);
    const [value, , signature] = token.split('.');
    expect(verifyCsrfToken(`${value}.other-session.${signature}`, env)).toBeNull();
  });

  it('rejects a token with a tampered value but a stale signature', () => {
    const token = issueCsrfToken(env, SESSION_ID);
    const [, , signature] = token.split('.');
    expect(verifyCsrfToken(`forged-value.${SESSION_ID}.${signature}`, env)).toBeNull();
  });
});

describe('csrf middleware', () => {
  const middleware = createCsrfMiddleware(env);

  it('passes safe methods through without a token', () => {
    const req = makeReq({ method: 'GET' });
    const next = vi.fn();
    middleware(req, {} as Response, next as NextFunction);
    expect(next).toHaveBeenCalledWith();
  });

  it('passes requests with no session credential through without a token', () => {
    const req = makeReq({ method: 'POST', cookies: {} });
    const next = vi.fn();
    middleware(req, {} as Response, next as NextFunction);
    expect(next).toHaveBeenCalledWith();
  });

  it('rejects a state-changing request with a session but no CSRF header', () => {
    const req = makeReq({
      cookies: { [ACCESS_TOKEN_COOKIE]: 'some-session', [CSRF_COOKIE]: issueCsrfToken(env, SESSION_ID) },
      auth: staffAuth(SESSION_ID),
    });
    const next = vi.fn();
    middleware(req, {} as Response, next as NextFunction);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 403 }));
  });

  it('rejects a mismatched header/cookie pair', () => {
    const req = makeReq({
      cookies: { [ACCESS_TOKEN_COOKIE]: 'some-session', [CSRF_COOKIE]: issueCsrfToken(env, SESSION_ID) },
      header: issueCsrfToken(env, SESSION_ID),
      auth: staffAuth(SESSION_ID),
    });
    const next = vi.fn();
    middleware(req, {} as Response, next as NextFunction);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 403 }));
  });

  it('rejects a same-site sibling origin forging its own cookie+header pair', () => {
    // A sibling subdomain can set/read its own cookies under the shared registrable domain,
    // but it does not know SESSION_SECRET, so it cannot mint a token that verifies.
    const forgedToken = `attacker-chosen-value.${SESSION_ID}.not-a-real-signature`;
    const req = makeReq({
      cookies: { [ACCESS_TOKEN_COOKIE]: 'some-session', [CSRF_COOKIE]: forgedToken },
      header: forgedToken,
      auth: staffAuth(SESSION_ID),
    });
    const next = vi.fn();
    middleware(req, {} as Response, next as NextFunction);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 403 }));
  });

  it('stops accepting the previous token once the session rotates', () => {
    // Refresh mints a new `app.sessions` row, so the caller's next request carries a new
    // `sid`. The token issued against the old session no longer matches it
    // (specs/authentication/spec.md - "A new CSRF token is issued on session rotation").
    const beforeRotation = issueCsrfToken(env, 'sess-before');
    const req = makeReq({
      cookies: { [ACCESS_TOKEN_COOKIE]: 'some-session', [CSRF_COOKIE]: beforeRotation },
      header: beforeRotation,
      auth: staffAuth('sess-after'),
    });
    const next = vi.fn();
    middleware(req, {} as Response, next as NextFunction);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 403 }));
  });

  it('allows a state-changing request whose token is bound to the caller’s session', () => {
    const token = issueCsrfToken(env, SESSION_ID);
    const req = makeReq({
      cookies: { [ACCESS_TOKEN_COOKIE]: 'some-session', [CSRF_COOKIE]: token },
      header: token,
      auth: staffAuth(SESSION_ID),
    });
    const next = vi.fn();
    middleware(req, {} as Response, next as NextFunction);
    expect(next).toHaveBeenCalledWith();
  });

  it('accepts a validly signed token on refresh, where the expired credential leaves no sid to bind', () => {
    // `POST /auth/refresh` normally arrives with an expired access credential, so `req.auth`
    // is absent and there is nothing to compare the binding against. The refresh response
    // immediately issues a token bound to the new session.
    const token = issueCsrfToken(env, 'sess-whatever');
    const req = makeReq({
      cookies: { [ACCESS_TOKEN_COOKIE]: 'expired', [CSRF_COOKIE]: token },
      header: token,
    });
    const next = vi.fn();
    middleware(req, {} as Response, next as NextFunction);
    expect(next).toHaveBeenCalledWith();
  });
});

/**
 * `setCsrfCookie` previously set neither `maxAge` nor `expires`, so browsers treated it as a
 * session cookie while `sid_rt` persisted 30 days — a restart left `sid_rt` with no
 * `csrf_token`, 403ing sign-in, refresh, and logout alike
 * (specs/authentication/spec.md - "CSRF cookie survives a browser restart").
 */
describe('setCsrfCookie / clearCsrfCookie', () => {
  function makeRes() {
    return { cookie: vi.fn(), clearCookie: vi.fn() } as unknown as Response & {
      cookie: ReturnType<typeof vi.fn>;
      clearCookie: ReturnType<typeof vi.fn>;
    };
  }

  it('sets the maxAge it is given, so the cookie persists across a browser restart', () => {
    const res = makeRes();
    setCsrfCookie(res, 'token-value', { secure: true, domain: undefined, maxAge: REFRESH_TOKEN_MAX_AGE_MS });
    expect(res.cookie).toHaveBeenCalledWith(
      CSRF_COOKIE,
      'token-value',
      expect.objectContaining({ maxAge: REFRESH_TOKEN_MAX_AGE_MS, httpOnly: false }),
    );
  });

  it('clearCsrfCookie is unaffected by the maxAge change — it still clears with no maxAge option', () => {
    const res = makeRes();
    clearCsrfCookie(res, { secure: true, domain: undefined });
    expect(res.clearCookie).toHaveBeenCalledWith(
      CSRF_COOKIE,
      expect.objectContaining({ httpOnly: false, secure: true }),
    );
    const [, options] = res.clearCookie.mock.calls[0] as [string, Record<string, unknown>];
    expect(options.maxAge).toBeUndefined();
  });
});
