## Why

The API has carried a complete reader authentication flow since `add-auth-foundation` — Google
sign-in with PKCE and nonce binding, reader upsert keyed on `google_sub`, session issuance, and
`GET /auth/me` behind `requireReader()`. The public site has never called any of it. There is no
sign-in affordance anywhere in `apps/web`, no session state, and no way for a reader to be
recognized. A finished, tested, security-reviewed auth surface is sitting unreachable.

Every reader-facing feature the architecture anticipates — likes, comments, bookmarks — is
blocked on identity. Nothing can be built on top of a reader until a reader can sign in.

## What Changes

- Readers can sign in to the public site with Google, and sign out again.
- The masthead gains a utility slot: a sign-in control when anonymous, the reader's name and
  avatar with a sign-out control when signed in.
- A new authenticated fetch client for `apps/web`, separate from the existing public one, that
  sends credentials, echoes the CSRF cookie as a header, and recovers a 401 by refreshing once
  and retrying.
- Refresh is single-flight: at most one `POST /auth/refresh` in flight at a time, shared by every
  caller that discovers a 401 together.
- Anonymous visitors make **no** session request at all. The absence of the script-readable
  `csrf_token` cookie is treated as conclusive evidence that no session exists, short-circuiting
  before any network call.
- Session resolution runs entirely client-side, so `/` and `/news/[slug]` keep their existing ISR
  behavior unchanged.

Non-goals for this change:

- A reader account page. Deferred until there is something to show on it — no likes, comments, or
  bookmarks exist in the schema, so the only available action would be sign-out, which the
  masthead already provides.
- Server-rendered session state. `docs/ARCHITECTURE.md` §8.1 anticipates Server Components
  forwarding the cookie header; doing that from the root layout would opt the entire route tree
  into dynamic rendering and kill ISR on every article. Revisited when an inherently-dynamic
  authenticated route exists to justify it.
- Any reader-authored content, engagement affordance, or write path.
- Admin-side reader moderation (list, ban, mute). The `app.readers` columns exist and
  `specs/authorization` already describes the enforcement, but no admin capability is added here.
- Any change to `apps/api`. The backend surface this consumes is already shipped.

## Capabilities

### New Capabilities

- `reader-session`: How the public site establishes, holds, recovers, and ends a reader's
  identity — the sign-in entry point, the anonymous fast path, the 401-keyed recovery cycle, and
  the session-dependent rendering in the masthead. The reader-side counterpart to the existing
  `admin-session` capability, which describes the same concerns for the admin client.

### Modified Capabilities

None. `authentication` and `authorization` already specify the server behavior this consumes and
are unchanged. `web-public-site` describes what the public routes render from backend content; a
session-dependent masthead control is a `reader-session` concern and does not alter any existing
requirement there.

## Impact

**Affected code** — `apps/web` only:

- New: an authenticated fetch client alongside `lib/api.ts`, which stays public-only and
  untouched so an authenticated request can never land in the ISR cache.
- New: a client-side reader session provider and hook, mounted in `app/layout.tsx`.
- New: a masthead utility slot, rendered in both `SiteHeader` and `StickyNav`.
- Modified: `app/layout.tsx` wraps children in the provider. No page's caching directives change.

**Affected configuration** — deployment, not code:

- `COOKIE_DOMAIN` is currently unset, which makes session cookies host-only. This works in local
  development only because `apps/web` and `apps/api` share the `localhost` host and cookies ignore
  ports. In any deployment where the two are on different subdomains, `COOKIE_DOMAIN` must be set
  to the shared parent domain or the browser will never send the session cookie to the API.
- `GOOGLE_REDIRECT_URI` must be registered in the Google console for each deployed environment.

**Dependencies**: none added.

**Risk**: the refresh endpoint is rate-limited at 30 requests per 15 minutes keyed on client IP.
Attempting refresh for callers who hold no session would let anonymous traffic behind a shared NAT
exhaust that budget and lock out genuine returning readers. The anonymous fast path above is the
mitigation, and is load-bearing rather than an optimization.
