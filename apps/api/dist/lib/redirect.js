const DEFAULT_PATH = '/';
/**
 * Validates a post-sign-in `next` target against the app's own origins. An unvalidated
 * redirect on a route the user just authenticated through is a phishing vector
 * (specs/authentication/spec.md - "Post-sign-in redirect targets are validated").
 */
export function resolveRedirectTarget(requested, env) {
    const defaultTarget = `${env.APP_ORIGIN}${DEFAULT_PATH}`;
    if (!requested)
        return defaultTarget;
    let url;
    try {
        url = new URL(requested, env.APP_ORIGIN);
    }
    catch {
        return defaultTarget;
    }
    const allowedOrigins = new Set([env.APP_ORIGIN, env.ADMIN_ORIGIN]);
    if (!allowedOrigins.has(url.origin))
        return defaultTarget;
    return url.toString();
}
