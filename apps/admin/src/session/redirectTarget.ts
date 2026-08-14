/** Where a signed-in caller with no preserved deep link lands (specs/admin-session/spec.md -
 *  "No preserved target defaults to the landing route"). */
export const DEFAULT_LANDING_ROUTE = '/dashboard';

/**
 * Validates a preserved-or-supplied post-sign-in target against the same rule
 * `apps/api/src/lib/redirect.ts` enforces server-side for the Google flow: only a relative,
 * same-app path is ever honored. Client-side and independent of that helper, since staff
 * sign-in returns 204 with no redirect semantics for it to validate
 * (design.md - "Deep-link preservation is client-side and relative-path-only"). An unvalidated
 * redirect target on a route the caller just authenticated through is a phishing vector,
 * whether the check runs on the server or here.
 */
export function resolveInAppTarget(candidate: unknown): string {
  if (typeof candidate !== 'string' || candidate.length === 0) return DEFAULT_LANDING_ROUTE;
  // Absolute URLs don't start with '/'. Protocol-relative ones double the leading slash
  // ("//evil.com"); the WHATWG URL parser normalizes a leading backslash the same way
  // ("/\evil.com" resolves to https://evil.com/, confirmed against `new URL()` directly), so
  // both forms of the second character are rejected identically. A backslash anywhere else in
  // the path stays same-origin and is left alone.
  if (!candidate.startsWith('/') || candidate.startsWith('//') || candidate.startsWith('/\\')) {
    return DEFAULT_LANDING_ROUTE;
  }
  return candidate;
}
