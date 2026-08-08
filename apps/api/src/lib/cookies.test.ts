import { describe, expect, it, vi } from 'vitest';
import type { Response } from 'express';
import { clearSessionCookies, setSessionCookies, sharedCookieOptions, type CookieEnv } from './cookies.js';
import { ACCESS_TOKEN_COOKIE } from '../middleware/authenticate.js';
import { REFRESH_TOKEN_COOKIE } from './tokens.js';

function makeRes() {
  return { cookie: vi.fn(), clearCookie: vi.fn() } as unknown as Response & {
    cookie: ReturnType<typeof vi.fn>;
    clearCookie: ReturnType<typeof vi.fn>;
  };
}

const httpsEnv: CookieEnv = {
  NODE_ENV: 'development',
  COOKIE_DOMAIN: undefined,
  APP_ORIGIN: 'https://staging.example.com',
};
const localEnv: CookieEnv = { NODE_ENV: 'development', COOKIE_DOMAIN: undefined, APP_ORIGIN: 'http://localhost:3000' };

/**
 * Nothing anywhere asserted these attributes, so the session cookies' whole defensive posture
 * — not script-readable, not sent over plaintext, not attached to cross-site navigations —
 * rested on three unverified literals.
 */
describe('session cookie attributes', () => {
  it('marks both credential cookies httpOnly, so script can never read them', () => {
    const res = makeRes();
    setSessionCookies(res, { accessToken: 'a', refreshToken: 'r' }, httpsEnv);

    const names = res.cookie.mock.calls.map(([name]) => name);
    expect(names).toEqual([ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE]);
    for (const [, , options] of res.cookie.mock.calls) {
      expect(options).toMatchObject({ httpOnly: true, sameSite: 'lax', path: '/' });
    }
  });

  /**
   * Previously gated on `NODE_ENV === 'production'`, so a staging deploy — HTTPS, real
   * credentials, real users — shipped session cookies with no `Secure` flag.
   */
  it('sets Secure on any HTTPS origin, not only when NODE_ENV is production', () => {
    const res = makeRes();
    setSessionCookies(res, { accessToken: 'a', refreshToken: 'r' }, httpsEnv);
    for (const [, , options] of res.cookie.mock.calls) {
      expect(options).toMatchObject({ secure: true });
    }
  });

  it('omits Secure only for a plaintext local origin, where it would break the cookie entirely', () => {
    const res = makeRes();
    setSessionCookies(res, { accessToken: 'a', refreshToken: 'r' }, localEnv);
    for (const [, , options] of res.cookie.mock.calls) {
      expect(options).toMatchObject({ secure: false });
    }
  });

  it('clears both credential cookies with matching attributes, so the browser actually drops them', () => {
    const res = makeRes();
    clearSessionCookies(res, httpsEnv);

    const names = res.clearCookie.mock.calls.map(([name]) => name);
    expect(names).toEqual([ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE]);
    for (const [, options] of res.clearCookie.mock.calls) {
      expect(options).toMatchObject({ httpOnly: true, secure: true, path: '/' });
    }
  });

  it('carries the shared attributes to the CSRF cookie, which is deliberately script-readable', () => {
    expect(sharedCookieOptions(httpsEnv)).toMatchObject({ secure: true, sameSite: 'lax', path: '/' });
  });
});
