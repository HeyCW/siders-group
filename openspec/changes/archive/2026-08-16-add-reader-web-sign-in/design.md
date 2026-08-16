## Context

See `proposal.md` — Why. The constraints that actually shape this design:

**The API side is fixed and already shipped.** `GET /auth/google?next=`, `GET /auth/google/callback`,
`GET /auth/me` (`requireReader()`), `POST /auth/refresh`, `POST /auth/logout`, and `GET /auth/csrf`
all exist and are tested. This change consumes them as-is.

**Readers are rejected with 401, staff with 403.** `requireReader()` throws
`401 unauthenticated` (`apps/api/src/middleware/authorize.ts`), whereas `requireStaff` and
`requirePermission` answer 403 for the same condition. The admin client's recovery interceptor is
therefore 403-keyed and cannot be reused verbatim — the reader client is a mirror of it keyed on
401, with two recovery branches instead of three (there is no `password_change_required` concept
for readers).

**`apps/web/lib/api.ts` was deliberately built public-only.** Its own doc comment records that
every endpoint it calls is `requirePublic()`, so it carries no credentials, no CSRF header, and no
recovery cycle. `/` and `/news/[slug]` set `revalidate = 60`; `/news` uses `cache: 'no-store'`.
That caching posture is the thing most at risk from adding authentication.

**Cookies are host-only today.** `COOKIE_DOMAIN` is unset, so session cookies are scoped to the
host that set them. Local development works only because `apps/web` (:3000) and `apps/api` (:4000)
share the `localhost` host and cookies ignore ports.

**`csrf_token` is script-readable by design and shares the refresh credential's lifetime.**
`apps/api/src/lib/csrf.ts` sets it `httpOnly: false` so a client can echo it as a header, with
`maxAge: REFRESH_TOKEN_MAX_AGE_MS` — the same 30 days as `sid_rt`.

## Goals / Non-Goals

**Goals:**

- Consume the existing auth surface without changing `apps/api`.
- Leave every public route's caching behavior byte-for-byte unchanged.
- Keep authenticated and public request paths structurally incapable of being confused.
- Make the anonymous path free — no network cost for the overwhelming majority of traffic.

**Non-Goals:**

- Reusing the admin interceptor. The two clients share a shape, not code; they live in different
  apps, different bundlers, and key on different status codes.
- A general-purpose authenticated data layer. This change authenticates exactly one read
  (`/auth/me`) and one write (`/auth/logout`).
- Server-rendered session state. Deferred with `/account` — see `proposal.md` — Non-goals.

## Decisions

### Two fetch clients, not one client with an authenticated mode

`lib/api.ts` stays exactly as it is; a separate module owns authenticated requests.

*Alternative considered:* one client with an `{ authed: true }` option. Rejected because the
failure mode is silent and severe. Next.js keys its fetch cache on URL and options; an
authenticated response that inherits a caching directive by accident becomes a cached page
carrying one reader's identity, served to everyone. A module boundary makes that
mistake unrepresentable rather than merely discouraged — the authenticated client never accepts a
`next.revalidate` option because it never takes caching options at all.

The cost is a small amount of duplicated envelope-unwrapping and `ApiError` shape. That
duplication is deliberate and worth stating: the two clients are expected to diverge further, not
converge, as the public one grows caching concerns and the authenticated one grows recovery ones.

### The CSRF cookie's presence is the anonymous fast path

Before any network call, the client checks for a readable `csrf_token` cookie. Absent → resolve
anonymous, full stop.

This is sound because the cookie is set only alongside a session (at sign-in, at refresh, and by
the re-pairing endpoint) and carries the refresh credential's own 30-day lifetime. It is not a
credential and proves nothing to the server — it is purely a local hint that saves a round trip.

*Alternative considered:* always probe `/auth/me`, treat 401 as anonymous. Rejected on the rate
limit. `refreshRateLimiter()` is 30 per 15 minutes keyed on `clientIp`
(`apps/api/src/modules/auth/auth.routes.ts`). Probing unconditionally means every anonymous
visitor's 401 escalates into a `POST /auth/refresh`; behind a corporate or carrier NAT, ordinary
anonymous readership would exhaust the shared bucket and a genuine returning reader would receive
`401 invalid_refresh_token` and appear permanently signed out. The failure is invisible in
development, appears only under real traffic, and looks like a backend bug. The fast path is
load-bearing.

*Second-order effect worth accepting:* a reader who clears cookies selectively, or whose
`csrf_token` expires while `sid_rt` somehow survives, is shown as signed out despite holding a
usable credential. Both cookies are written together with the same lifetime, so this is a narrow
window, and its consequence is one extra sign-in click rather than an error.

### Single-flight refresh, ported in shape from the admin client

At most one `POST /auth/refresh` in flight, shared by all waiters, resolving to a boolean and
never throwing.

This is not a performance optimization. `specs/authentication` treats a second presentation of a
refresh credential as reuse regardless of intent and revokes the entire session lineage — so two
concurrent refreshes sign the reader out of every device. `apps/admin/src/lib/api.ts` documents
the same reasoning; the mechanism is deliberately identical.

v1 has one probe from one provider, so contention is unlikely today. The mechanism goes in anyway,
because the moment a second authenticated call exists the failure becomes possible, and it is a
destructive failure that no test would catch by accident.

### Recovery lives in the client, session state lives in a provider

The authenticated client owns the retry cycle and exposes no recovery concerns. A React context
provider owns "who is signed in," probes once on mount, and re-resolves after sign-out.

The provider does not import recovery internals and the client does not import React. Where the
admin app needed an event-emitter bridge between the two (`onSessionExpired`), this one does not:
with a single probe, the client can simply resolve to `null` and let the provider interpret it. If
a second authenticated call is ever added, that bridge becomes necessary — noting it here so the
absence reads as a scoping decision rather than an oversight.

### Sign-in is a plain link, not a button with a handler

`<a href={API_URL + '/auth/google?next=' + encodeURIComponent(currentUrl)}>`. A full document
navigation, so no CORS preflight, no credentials mode, no client-side OAuth state.

The `next` value is validated server-side by `resolveRedirectTarget` against `APP_ORIGIN` and
`ADMIN_ORIGIN`, so a malformed or hostile value degrades to the default landing page rather than
becoming an open redirect. The client still sends only its own location — defense in depth, and it
keeps the client honest about what it is asking for.

### The utility slot renders in both header surfaces

`SiteHeader`'s masthead is deliberately centered and symmetric — a 92px serif wordmark between two
rules. Inserting an account chip into that composition fights the design. `StickyNav` already has a
`justify-between` row with clear space at the right, but it is hidden until `scrollY > 240`, so it
cannot be the only home.

Decision: one shared component, rendered in the sticky bar's existing right-hand space and in a
small dedicated row above the masthead's top rule — where a broadsheet's dateline furniture would
sit. Small, sans-serif, uppercase, in the muted ink already used for the edition marker, so it
reads as masthead furniture rather than as app chrome.

### Session state is a three-state union, not a boolean

`loading | anonymous | authenticated`. The spec forbids presenting the signed-in state before
resolution; a boolean would collapse `loading` into `anonymous` and produce a visible flash of
"Sign in" for readers who are in fact signed in. With the fast path above, `loading` is
instantaneous for anonymous visitors — they never enter it — so the flash is confined to the
population that actually has a session, where it resolves in one round trip.

## Risks / Trade-offs

**Session cookies never reach the API in a real deployment** → `COOKIE_DOMAIN` is unset and
cookies are host-only. Works on `localhost` by coincidence of the shared host; breaks the first
time `apps/web` and `apps/api` sit on different subdomains, and breaks silently — the reader
signs in, gets redirected back, and appears anonymous. Mitigation: set `COOKIE_DOMAIN` to the
shared parent domain per environment, and verify the round trip as an explicit deployment
check rather than assuming local success generalizes.

**An authenticated response gets cached and served to another reader** → catastrophic and quiet.
Mitigation: the module boundary above, plus the spec requirement that no cached content contain
reader-identifying data. The authenticated client is client-side only and accepts no caching
options.

**Anonymous traffic exhausts the refresh rate limit** → addressed by the fast path; recorded here
because if the fast path is ever removed as "an unnecessary optimization," this returns.

**Concurrent refresh revokes the session lineage** → single-flight refresh. Currently unreachable
with one probe; the guard exists for the second caller.

**Flash of the anonymous state for signed-in readers** → accepted. It is the direct cost of
keeping ISR, and it affects only readers who hold a session. Revisit if and when `/account` brings
server-rendered session state with it.

**A banned reader cannot tell they were banned** → `requireReader()` returns the same
`401 unauthenticated` for a deactivated account as for no account, so no client can distinguish
them. Accepted for this change and specified explicitly rather than left as an accident; a
distinguishable ban notice would need a new API affordance and belongs with reader moderation.

## Migration Plan

No data migration, no API change, no breaking change to existing routes. Deployment is a single
web build, plus the `COOKIE_DOMAIN` and Google redirect-URI configuration noted in `proposal.md`
— Impact. Rollback is reverting the web deploy; the API is untouched and readers who signed in
during the window simply hold cookies nothing reads.
