import { API_URL } from './env';

/**
 * The API's Google sign-in entry point, carrying where to return the reader afterwards.
 *
 * Shared by the masthead's `ReaderControl` and the article page's inline `SignInPrompt` so the
 * two cannot drift — `specs/reader-session/spec.md` requires the return target to name a location
 * within the public site and never another origin, which is a property of how this string is
 * built, not of where it is built.
 */
export function signInHref(currentLocation: string): string {
  // Not /api-prefixed: this route lives in routes/web.php on the Laravel side (a full-page
  // navigation through Google's own login page needs an unconditional session, which only the
  // 'web' middleware group guarantees — see GoogleAuthController's class doc).
  return `${API_URL}/auth/google/redirect?next=${encodeURIComponent(window.location.origin + currentLocation)}`;
}

/**
 * The reader's full in-app location including its query string, for use in a click handler.
 *
 * `usePathname()` carries no query string, but `/news`'s category filter lives in one. Reading
 * `window.location` at click time rather than calling `useSearchParams()` keeps the calling
 * component a plain synchronous one: that hook forces a Suspense boundary around every render of
 * its component, and these components are mounted on `/` and `/news/[slug]` — routes that are
 * deliberately statically rendered.
 */
export function currentLocationWithQuery(): string {
  return window.location.pathname + window.location.search;
}
