import { verifyAccessToken } from '../lib/tokens.js';
export const ACCESS_TOKEN_COOKIE = 'sid_at';
/**
 * Identifies the caller and nothing else. Missing, invalid, or expired credentials are all
 * anonymous — never an error; rejecting a caller is exclusively authorization's job
 * (`authorize.ts`). Verification is local EdDSA only — no database read on this path
 * (docs/ARCHITECTURE.md §5.5, specs/authentication/spec.md - "Authentication only
 * identifies, never authorizes").
 */
export function createAuthenticate(env) {
    return async function authenticate(req, _res, next) {
        const token = req.cookies?.[ACCESS_TOKEN_COOKIE];
        if (typeof token === 'string' && token.length > 0) {
            try {
                req.auth = await verifyAccessToken(token, env);
            }
            catch {
                /* expired or invalid — treated as anonymous, client will refresh */
            }
        }
        next();
    };
}
