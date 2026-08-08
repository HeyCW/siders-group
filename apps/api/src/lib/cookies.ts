import type { CookieOptions, Response } from 'express';
import type { Env } from '../config/env.js';
import { ACCESS_TOKEN_COOKIE } from '../middleware/authenticate.js';
import { REFRESH_TOKEN_COOKIE } from './tokens.js';

export type CookieEnv = Pick<Env, 'NODE_ENV' | 'COOKIE_DOMAIN' | 'APP_ORIGIN'>;

const ACCESS_TOKEN_MAX_AGE_MS = 15 * 60 * 1000;
const REFRESH_TOKEN_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * `Secure` is keyed on the deployment actually being HTTPS, not on `NODE_ENV === 'production'`.
 * Those are different questions: a staging or preview deploy runs over HTTPS with
 * `NODE_ENV` set to something else, and would have shipped session cookies without `Secure` —
 * readable by any network intermediary. Local dev over plain HTTP is the only case that needs
 * the flag off, and it is identified by an insecure `APP_ORIGIN`, which is the thing that is
 * actually true of it.
 */
function requiresSecureCookies(env: CookieEnv): boolean {
  return !env.APP_ORIGIN.startsWith('http://');
}

function sharedOptions(env: CookieEnv): Pick<CookieOptions, 'secure' | 'domain' | 'sameSite' | 'path'> {
  return {
    secure: requiresSecureCookies(env),
    domain: env.COOKIE_DOMAIN,
    sameSite: 'lax', // survives the OAuth redirect back from Google (docs/ARCHITECTURE.md §5.3)
    path: '/',
  };
}

export interface IssuedSessionTokens {
  accessToken: string;
  refreshToken: string;
}

/** Neither token appears anywhere but these two httpOnly cookies — never in a response body. */
export function setSessionCookies(res: Response, tokens: IssuedSessionTokens, env: CookieEnv): void {
  const shared = sharedOptions(env);
  res.cookie(ACCESS_TOKEN_COOKIE, tokens.accessToken, { ...shared, httpOnly: true, maxAge: ACCESS_TOKEN_MAX_AGE_MS });
  res.cookie(REFRESH_TOKEN_COOKIE, tokens.refreshToken, { ...shared, httpOnly: true, maxAge: REFRESH_TOKEN_MAX_AGE_MS });
}

export function clearSessionCookies(res: Response, env: CookieEnv): void {
  const shared = sharedOptions(env);
  res.clearCookie(ACCESS_TOKEN_COOKIE, { ...shared, httpOnly: true });
  res.clearCookie(REFRESH_TOKEN_COOKIE, { ...shared, httpOnly: true });
}

export { sharedOptions as sharedCookieOptions };
