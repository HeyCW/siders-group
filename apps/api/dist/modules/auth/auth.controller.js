import { toReaderAccountResponse } from './auth.mapper.js';
import { AppError } from '../../middleware/errorHandler.js';
import { clearCsrfCookie, setCsrfCookie } from '../../lib/csrf.js';
import { setSessionCookies, clearSessionCookies, sharedCookieOptions, REFRESH_TOKEN_MAX_AGE_MS, } from '../../lib/cookies.js';
import { REFRESH_TOKEN_COOKIE } from '../../lib/tokens.js';
import { sessionMetaFromRequest } from '../../lib/sessionMeta.js';
/** Parse, delegate, respond. No `if` about business meaning lives here. */
export function createAuthController(service, env) {
    return {
        async refresh(req, res, next) {
            try {
                const raw = req.cookies?.[REFRESH_TOKEN_COOKIE];
                if (typeof raw !== 'string' || raw.length === 0) {
                    throw new AppError('No refresh credential presented', 401, 'invalid_refresh_token');
                }
                const issued = await service.refresh(raw, sessionMetaFromRequest(req, env));
                setSessionCookies(res, issued, env);
                setCsrfCookie(res, issued.csrfToken, { ...sharedCookieOptions(env), maxAge: REFRESH_TOKEN_MAX_AGE_MS });
                res.status(204).end();
            }
            catch (err) {
                next(err);
            }
        },
        async logout(req, res, next) {
            try {
                const raw = req.cookies?.[REFRESH_TOKEN_COOKIE];
                await service.logout(typeof raw === 'string' ? raw : undefined, req.auth?.sessionId);
                clearSessionCookies(res, env);
                clearCsrfCookie(res, sharedCookieOptions(env));
                res.status(204).end();
            }
            catch (err) {
                next(err);
            }
        },
        async me(req, res, next) {
            try {
                const subjectId = req.auth?.subjectId;
                if (!subjectId)
                    throw new AppError('Not authenticated', 401, 'unauthenticated');
                const account = await service.getReaderAccount(subjectId);
                if (!account)
                    throw new AppError('Reader not found', 404, 'not_found');
                res.json({ success: true, data: toReaderAccountResponse(account) });
            }
            catch (err) {
                next(err);
            }
        },
    };
}
