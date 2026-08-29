export const OAUTH_STATE_COOKIE = 'oauth_state';
export const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
/**
 * A plain (unsigned) short-lived httpOnly cookie — its integrity comes from the browser's
 * same-origin cookie jar, not from a signature. Cleared on first read by the caller, making
 * a replayed callback fail with "missing state" rather than succeeding a second time.
 */
export function encodeOAuthState(payload) {
    return Buffer.from(JSON.stringify(payload)).toString('base64url');
}
export function decodeOAuthState(value) {
    try {
        const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
        if (typeof parsed === 'object' &&
            parsed !== null &&
            typeof parsed.state === 'string' &&
            typeof parsed.codeVerifier === 'string' &&
            typeof parsed.nonce === 'string') {
            return parsed;
        }
        return null;
    }
    catch {
        return null;
    }
}
