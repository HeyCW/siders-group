## Context

Per `docs/ARCHITECTURE.md` §5.3/§5.5: two tokens in httpOnly cookies (`sid_at`, 15 minutes; `sid_rt`, 30 days sliding), a script-readable `csrf_token` double-submit cookie, and a two-tier check — identification is stateless and never rejects, authorization is stateful and fails closed. All of that is implemented and specified (`specs/authentication`, `specs/authorization`). Nothing in `apps/admin` uses any of it: `apps/admin/src/App.tsx:14-16` is a stub and every route is unguarded.

The five endpoints this change builds against are existing and are not redesigned:

```
POST /auth/staff/login   apps/api/src/modules/auth/auth.routes.ts:110   requirePublic(), rate-limited, 204 + cookies, no body
GET  /users/me           apps/api/src/modules/users/user.routes.ts:17   requireStaff({ allowPendingPasswordChange: true })
POST /staff/me/password  apps/api/src/modules/staff/staff.routes.ts:67  requireStaff({ allowPendingPasswordChange: true }), rate-limited
POST /auth/refresh       apps/api/src/modules/auth/auth.routes.ts:84    requirePublic(), rate-limited, 204 + rotated cookies
POST /auth/logout        apps/api/src/modules/auth/auth.routes.ts:90    requirePublic(), 204, clears cookies
```

Two defects surfaced while designing the client against these:

1. **CSRF cookie has no lifetime.** `setCsrfCookie` (`apps/api/src/lib/csrf.ts`) sets neither `maxAge` nor `expires`, so browsers treat it as a session cookie. `sid_rt` carries `maxAge: 30 * 24 * 60 * 60 * 1000` (`apps/api/src/lib/cookies.ts`). After a browser restart the jar can hold `sid_rt` with no `csrf_token`. `createCsrfMiddleware` is mounted globally at `apps/api/src/server.ts:48`, before every route, and fires whenever `sid_at || sid_rt` is present — so sign-in, refresh, and logout all 403 `csrf_failed` until `sid_rt` itself expires (up to 30 days) or the jar is cleared by hand.
2. **No refresh call anywhere in `apps/admin`.** `apps/admin/src/lib/api.ts` never touches `/auth/refresh`. An expired access credential is anonymous to `authenticate` (per `specs/authentication`), so `requireStaff`/`requirePermission` then throw 403 `forbidden`. A valid 30-day session is bounced to sign-in after 15 idle minutes.

`resolveStaffAccess` (`apps/api/src/middleware/authorize.ts:136-161`) already computes `permissionKeys` and the Owner comparison on every gated request; today only `requireStaff`/`requirePermission` consume the result (into `req.staffRole: { roleId, isOwner }`, `authorize.ts:127-133, 196-197, 228-233`), and `GET /users/me`'s own DTO (`user.mapper.ts`) is built from a separate, narrower query in `user.repository.ts` that never touches `role_permissions`.

This change follows the app's actual established frontend pattern — a plain `apiFetch`/`apiUpload` wrapper (`apps/admin/src/lib/api.ts`) plus local hooks (`useAsyncAction.ts`) — rather than `docs/ARCHITECTURE.md` §8.2's aspirational TanStack Query / react-hook-form, which no admin screen currently uses.

## Goals / Non-Goals

**Goals:**
- Make a staff session survive the two conditions every real session hits: a browser restart inside the 30-day refresh window, and 15 idle minutes inside a signed-in day.
- Make the 403-is-ambiguous problem a specified algorithm, not a per-screen guess, and make single-flight refresh a first-class requirement rather than an implementation footnote — a naive interceptor here doesn't degrade, it destroys the session it was trying to save.
- Let the admin app render permission-aware navigation without moving one bit of enforcement to the client.
- Land the CSRF fix generally enough that it also fixes the reader flow for free, since both share `setCsrfCookie`.

**Non-Goals:** see `proposal.md` - Non-Goals. Additionally, at the design level: no state-management library beyond what `apps/admin` already uses (no TanStack Query, no Redux/Zustand); no visual design system work beyond what's needed to exercise the state machine below; no change to `resolveRedirectTarget` (`apps/api/src/lib/redirect.ts`), which stays exactly what it is today — a server-side, Google-flow-only helper that this change does not call, since staff sign-in returns 204 with no redirect semantics.

## Decisions

**CSRF cookie lifetime tracks the refresh cookie's, via a shared constant.** `setCsrfCookie`'s options type is currently `Pick<CookieOptions, 'secure' | 'domain'>` (`csrf.ts:61-64`) — no `maxAge` parameter exists to set. The fix: export `REFRESH_TOKEN_MAX_AGE_MS` from `cookies.ts` (currently a private `const`), extend `setCsrfCookie` to accept and apply a `maxAge` of at least that value, and pass it from all three call sites that currently call `setCsrfCookie(res, issued.csrfToken, sharedCookieOptions(env))`: staff login (`auth.routes.ts:120`), refresh (`auth.controller.ts:26`), and the Google callback (`google.routes.ts:114`).
- Alternative considered: give the CSRF cookie its own independent, shorter lifetime (e.g. 7 days) on the theory that a shorter-lived script-readable cookie is marginally safer. Rejected — a CSRF cookie that can expire before its refresh cookie reintroduces exactly the lockout this change exists to close, just on a longer timer instead of a browser restart. The cookie's job is to always be present whenever `sid_rt` is, so its lifetime has no independent value to tune.
- Because `setCsrfCookie` is subject-type-agnostic and is already called identically for the Google reader callback, this one fix closes the lockout for both audiences without any reader-specific change — consistent with the accepted "share one cookie" constraint below.

**`GET /users/me` sources `permissionKeys`/`isOwner` from `req.staffRole`, not a second query.** `resolveStaffAccess` already resolves both on every gated request. The chosen shape: extend `StaffRoleContext` (`authorize.ts:10-13`) with `permissionKeys: string[]`, populate it in both `requireStaff` and `requirePermission` from the `access` value each already computes, and have `user.controller.ts`'s `getMe` read `req.staffRole.permissionKeys` / `.isOwner` instead of `user.service.ts`/`user.repository.ts` issuing an independent `role_permissions` join.
- Alternative considered: have `user.repository.ts`'s `findById` join `role_permissions`/`permissions` itself and compare against the Owner role id directly. Rejected as a second, redundant computation of exactly what the middleware already resolved one line earlier in the same request, and a second place that could drift from `resolveStaffAccess`'s definition of "effective permission."
- This is additive to `StaffUserDto`: `roleId`, `roleName`, `status`, `mustChangePassword`, and every other existing field are untouched, so nothing that already reads this DTO can break.

**Single-flight refresh: exactly one in-flight `/auth/refresh` call per session, ever.** The recovery path for a 403 on a feature request:

```
403 on a feature route (not the sign-in screen's own submission)
  └─▶ single-flight POST /auth/refresh
        ├─ succeeds ─▶ retry the original request once
        │                 └─ still 403 ─▶ re-probe GET /users/me
        │                                   ├─ probe ok   ─▶ permission denial → forbidden UI, stay signed in
        │                                   └─ probe fails ─▶ session gone → /login
        └─ fails ─▶ /login
```

"Single-flight" is load-bearing, not a nice-to-have: `specs/authentication` requires that reusing an already-rotated refresh credential "revokes every session in that credential's lineage." If N concurrent requests each discover their own 403 and each fire an independent refresh, the first rotates the credential and every other presents one already consumed — the backend cannot tell that from theft, so it revokes the whole lineage and hard-logs-out a caller who did nothing wrong. A correct interceptor therefore holds one shared in-flight refresh (e.g. one stored promise, created by whichever request discovers the 403 first and cleared when it settles) that every other discovering request awaits instead of duplicating.
- Alternative considered: retry each failing request independently with backoff, no de-duplication. Rejected — it is the exact failure mode above; backoff changes timing, not the fact that a second request will still present an already-rotated credential.
- Alternative considered: a proactive timer that refreshes shortly before the 15-minute mark (e.g. at 14 minutes) instead of reacting to a 403. Considered as a possible future latency optimization, not built here: a backgrounded or sleeping tab (laptop lid closed) sleeps through the timer just as easily as it would sit idle, so the reactive 403-triggered path is required regardless of whether a timer also exists. Adding one is a strict addition on top of this change's mechanism, not a substitute for it, so it's left as a follow-up rather than bundled in.
- The sign-in screen's own credential submission is explicitly excluded from this interceptor. It is the one screen where a 403 can occur with no session at all to refresh — for a returning caller whose `sid_rt` is still present but whose CSRF cookie was still missing before the fix above, the login POST itself would 403 `csrf_failed`, and attempting a refresh in response would be both meaningless (refresh cannot fix a CSRF mismatch) and itself blocked by the same missing cookie.

**A still-403 retry is disambiguated by re-probing, not by inspecting the status code.** `requireStaff` and `requirePermission` both throw 403 `forbidden` for "no staff session" (`authorize.ts:186-191`, `:218-223`), and `requirePermission` reuses the identical 403 `forbidden` for "insufficient permission" (`authorize.ts:230-232`). No staff session also yields 403, not 401 — unlike the reader side (`requireReader` throws 401 `unauthenticated`, `authorize.ts:110-114`), so a guard watching for 401 on the admin side never fires. After a refresh succeeds and the retried request still fails, the only way to tell "your role lacks this permission" from "your session is actually gone" apart is to ask a question only a real session can answer: `GET /users/me`. A successful probe proves a session exists (permission denial); a failed probe proves it doesn't (session gone).
- Alternative considered: add a new, more specific error code to `requirePermission` distinguishing "no session" from "insufficient permission." Rejected — it would touch an existing, working backend endpoint's error contract for a distinction the client can already recover with one extra request on what is already the uncommon path (reached only when refresh didn't resolve things), and this change's scope is additive to the backend, not a redesign of it.

**Deep-link preservation is client-side and relative-path-only, independent of `resolveRedirectTarget`.** `resolveRedirectTarget` (`apps/api/src/lib/redirect.ts`) validates a post-sign-in target against an origin allowlist, but it is server-side and wired only into the Google OAuth callback; staff sign-in returns 204 with no redirect field at all. The admin app therefore captures the originally requested route itself (e.g. before redirecting an unauthenticated visitor to `/login`) and restores it after a successful sign-in, accepting the target only if it is a same-app relative path. The restriction exists for the same reason `resolveRedirectTarget` has one: an unvalidated redirect target on a route the caller just authenticated through is a phishing vector, and that risk doesn't go away just because this path is client-side instead of server-side.
- Alternative considered: extend `POST /auth/staff/login` to accept and validate a `next` parameter server-side, mirroring the Google flow. Rejected — the endpoint has no redirect semantics today (it returns 204), and adding one is exactly the kind of endpoint redesign this change avoids; the client already has everything it needs to make this decision itself.

**Generic sign-in failure UI: render the server's response, and stop there.** `specs/authentication` already makes the server's failure response indistinguishable for a wrong password, an unknown email, and a throttled attempt (`respondWithGenericFailure`, `auth.routes.ts:24-26`, always 401 `invalid_credentials`). The client's job is to not undo that: the sign-in screen shows one fixed message for any rejected attempt and never branches on the error's `code` to synthesize a "too many attempts" state the server didn't send.

**The reader/staff shared CSRF cookie stays shared; this remains safe under the fix above.** `app.sessions` rows are partitioned by `subjectType`, and `resolveReaderAccess`/`resolveStaffAccess` (`authorize.ts:71-85`, `:136-161`) each query only their own subject type — a CSRF token's binding is to a `sessionId`, not to a subject type, and that `sessionId` was already exclusively a reader's or a staff member's before this change. Giving the cookie a longer lifetime doesn't change which sessions it can be used against; it only changes how long the token stays paired with whichever refresh cookie it was issued alongside. The two subject types remain mutually exclusive by construction, so nothing here is a new namespace-collision risk — it is an accepted constraint carried forward unchanged, not a new one introduced by this change.

## Risks / Trade-offs

- **[Sign-out is not a cryptographic guarantee on a failed network call]** → httpOnly cookies can only be cleared by a successful server response (`clearSessionCookies`/`clearCsrfCookie`); if the `POST /auth/logout` call itself fails (e.g. offline), the client-visible "returned to sign-in" is a rendering decision, not proof the session ended server-side. Accepted: the real control is the successful call, and a caller who is offline can't reach any other endpoint either.
- **[CSRF cookie now persists up to 30 days on a shared device]** → the fix deliberately extends a script-readable cookie's lifetime to match `sid_rt`, which already persists that long. Accepted as no new exposure: the CSRF cookie alone authorizes nothing without the httpOnly session cookie it is paired with, and `sid_rt`'s own 30-day window is unchanged by this proposal (see Non-Goals).
- **[Boot probe adds one request to every cold load]** → `GET /users/me` runs before any protected route renders. Accepted — it is the same cheap, already-indexed call `getMe` serves today, and every session-aware SPA pays an equivalent cost.
- **[The refresh → retry → re-probe chain adds latency to a genuine permission denial]** → up to three sequential requests before a denial renders. Accepted deliberately: this path is only reached when a refresh didn't resolve the first 403, which is the uncommon case, and correctly separating "no permission" from "no session" matters more here than shaving one request off it.
- **[Reported `permissionKeys`/`isOwner` can lag the caller's true state between probes]** → rendered navigation can be briefly stale until the next `/users/me` read (e.g. the next refresh cycle or an explicit re-probe). Mitigated structurally, not by freshness: `admin-session`'s "Permission-aware rendering is cosmetic" requirement means staleness here is a rendering nuisance, never a security gap, because the server re-evaluates every request regardless of what was last reported.

## Build Order

1. **Backend fixes first** — CSRF cookie `maxAge` and the `permissionKeys`/`isOwner` DTO fields. Both are additive and independently shippable ahead of any frontend work, and the frontend's permission-aware rendering has nothing to consume without the second one.
2. **Session API client** — the module wrapping the five endpoints, built on the existing `apiFetch`/`apiUpload`.
3. **Single-flight refresh interceptor** — everything else that talks to a feature route depends on this existing first, including the boot probe itself (Goal: boot-time 403s recover the same way mid-session ones do).
4. **Route guard + boot probe**, then **sign-in screen** with generic failure handling, then **forced password-change screen**, then **logout**, then **deep-link preservation**, then **permission-aware rendering** — each consumes the layer below it and is otherwise independent.

## Migration Plan

No schema change. The CSRF cookie change is a backward-compatible attribute addition to an existing cookie; the `GET /users/me` change is a backward-compatible additive field on an existing response body. Rollback is reverting the `maxAge` addition and the two new DTO fields — neither has any data to backfill in either direction.
