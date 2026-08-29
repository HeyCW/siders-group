import { createHmac, randomBytes } from 'node:crypto';
import { AppError } from '../middleware/errorHandler.js';
import { ACCESS_TOKEN_COOKIE } from '../middleware/authenticate.js';
import { REFRESH_TOKEN_COOKIE } from './tokens.js';
import { timingSafeEqualString } from './hashCompare.js';
export const CSRF_COOKIE = 'csrf_token';
export const CSRF_HEADER = 'x-csrf-token';
function sign(value, secret) {
    return createHmac('sha256', secret).update(value).digest('hex');
}
/**
 * `value.sessionId.signature` double-submit token. The cookie is deliberately script-readable
 * (not httpOnly) — the client echoes it back as a header, and an attacker's page can never
 * read it cross-origin. The signature is the extra layer: a same-site sibling subdomain
 * (which *can* set/read its own cookies under the shared `.siders.id` domain) still can't
 * produce a token that verifies without knowing `SESSION_SECRET`
 * (specs/authentication/spec.md - "Request from a same-site sibling origin is still
 * rejected without a token").
 *
 * The token is bound to the session that issued it, which is what retires the previous one
 * on rotation (specs/authentication/spec.md - "A new CSRF token is issued on session
 * rotation"): refresh mints a *new* `app.sessions` row, so the incoming access credential
 * carries a new `sid` and a token signed against the old one no longer matches. Binding
 * stays stateless — the check compares against the `sid` claim already verified by
 * `authenticate`, never a database read.
 *
 * The embedded session id is not a credential. It identifies a session row; acting as that
 * session still requires the EdDSA-signed access cookie, which script cannot read.
 */
export function issueCsrfToken(env, sessionId) {
    const value = randomBytes(32).toString('base64url');
    const body = `${value}.${sessionId}`;
    return `${body}.${sign(body, env.SESSION_SECRET)}`;
}
/** Returns the bound session id, or null when the signature does not verify. */
export function verifyCsrfToken(token, env) {
    const parts = token.split('.');
    if (parts.length !== 3)
        return null;
    const [value, sessionId, signature] = parts;
    if (!value || !sessionId || !signature)
        return null;
    if (!timingSafeEqualString(signature, sign(`${value}.${sessionId}`, env.SESSION_SECRET))) {
        return null;
    }
    return { sessionId };
}
export function setCsrfCookie(res, token, options) {
    res.cookie(CSRF_COOKIE, token, {
        httpOnly: false, // must be script-readable — the client echoes it back as a header
        secure: options.secure,
        sameSite: 'lax',
        domain: options.domain,
        maxAge: options.maxAge,
        path: '/',
    });
}
export function clearCsrfCookie(res, options) {
    res.clearCookie(CSRF_COOKIE, {
        httpOnly: false,
        secure: options.secure,
        sameSite: 'lax',
        domain: options.domain,
        path: '/',
    });
}
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
/**
 * Mounted globally, never opt-in per route (specs/authentication/spec.md - "State-changing
 * requests require a CSRF token"). Requests with no session credential at all pass through
 * unaffected — there's no authenticated state to forge yet.
 */
export function createCsrfMiddleware(env) {
    return function csrfMiddleware(req, _res, next) {
        if (SAFE_METHODS.has(req.method)) {
            next();
            return;
        }
        const hasSessionCredential = Boolean(req.cookies?.[ACCESS_TOKEN_COOKIE] || req.cookies?.[REFRESH_TOKEN_COOKIE]);
        if (!hasSessionCredential) {
            next();
            return;
        }
        const header = req.get(CSRF_HEADER);
        const cookie = req.cookies?.[CSRF_COOKIE];
        if (!header || !cookie || !timingSafeEqualString(header, cookie)) {
            next(new AppError('CSRF token missing or invalid', 403, 'csrf_failed'));
            return;
        }
        const payload = verifyCsrfToken(cookie, env);
        if (!payload) {
            next(new AppError('CSRF token missing or invalid', 403, 'csrf_failed'));
            return;
        }
        // Only enforceable when the access credential identified a session. On `POST /auth/refresh`
        // the access credential has usually expired, so there is no `sid` to bind against — the
        // signature alone carries the request, and the refresh response immediately issues a token
        // bound to the new session.
        if (req.auth && payload.sessionId !== req.auth.sessionId) {
            next(new AppError('CSRF token does not match this session', 403, 'csrf_failed'));
            return;
        }
        next();
    };
}
