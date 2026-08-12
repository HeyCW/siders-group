## Why

`apps/admin/src/App.tsx:14-16` renders a `LoginPage` stub (`<div>Login</div>`), and every route in that file is unguarded — the entire admin SPA is reachable by an anonymous browser today, even though staff authentication and permission-based authorization are fully specified and implemented on the backend. Building the missing login surfaced two backend defects that would make it fail in practice rather than merely be incomplete: `setCsrfCookie` (`apps/api/src/lib/csrf.ts`) issues the CSRF cookie with no `maxAge`, so it is dropped on browser close while the 30-day `sid_rt` cookie survives — the next visit then 403s on every state-changing request, including sign-in, refresh, and sign-out, the very requests that would recover from it. And nothing in `apps/admin` ever calls `POST /auth/refresh`, so a valid 30-day session gets bounced to a fresh sign-in after 15 idle minutes — the access credential's lifetime. Both defects have to close for a login flow to actually work, not just exist.

## What Changes

- Replace the `LoginPage` stub with a real sign-in screen against `POST /auth/staff/login`, and guard every other admin route behind a resolved session, preserving the originally requested in-app path across a forced sign-in (relative paths only — never an absolute or cross-origin target).
- Add a single-flight, retry-once session refresh so a 403 caused only by the 15-minute access credential expiring is recovered transparently against the 30-day refresh credential. Single-flight is not an optimization here: a naive per-request interceptor issuing parallel refreshes would present an already-rotated credential to every request but the first, which the backend treats as compromise and revokes the entire session lineage for.
- Add the 403-disambiguation algorithm for the case a refresh doesn't resolve: `requireStaff`/`requirePermission` answer 403 for "no session" and for "insufficient permission" alike (and 403, not 401, for "no session"), so a still-failing retry re-probes `GET /users/me` to tell the two apart — permission denial keeps the caller signed in, a lost session sends them to sign-in.
- Add the forced password-change screen for accounts with `mustChangePassword` set, calling `POST /staff/me/password` to lift it, and a logout affordance calling `POST /auth/logout`. Neither exists in the admin app today.
- Make the sign-in screen's failure message generic and undifferentiated — identical wording for a wrong password, an unknown email, and a throttled attempt — so the client doesn't reintroduce a distinction the server deliberately hides.
- Fix the CSRF cookie's lifetime (`apps/api/src/lib/csrf.ts`) so it survives a browser restart, tracking the refresh cookie's, and make explicit that a caller integration must never hold more than one in-flight refresh request per session, since the server cannot tell a raced legitimate retry from a stolen credential and treats both as compromise.
- Extend `GET /users/me` to additionally report the caller's currently effective permission keys and Owner status, so the admin app can decide what to render. This is for rendering only: every permission and staff-only check continues to evaluate independently at request time, and nothing reported changes what is enforced.
- **BREAKING**: none. `GET /users/me`'s response gains two additive fields; every existing field, endpoint, and status code is unchanged.

## Non-Goals

- Reader (Google) sign-in UI. Nothing here touches `apps/web` or the reader-facing session; this change is the staff/admin side only.
- Splitting the reader and staff session into separate cookie namespaces. They continue to share `sid_at` / `sid_rt` / `csrf_token`; see `design.md` for why that stays safe.
- Changing backend authorization from permission-based to role-based, or adding a role-name branch anywhere. `GET /users/me` reports the caller's permissions; it does not change how any endpoint evaluates them.
- Any change to the refresh token's 30-day lifetime or the access token's 15-minute lifetime.
- Redesigning any of the five existing endpoints this change consumes (`POST /auth/staff/login`, `GET /users/me`, `POST /staff/me/password`, `POST /auth/refresh`, `POST /auth/logout`) beyond the two additions named above.

## Capabilities

### New Capabilities
- `admin-session`: the admin SPA's session lifecycle — the boot/route-guard session probe, sign-in and its generic failure messaging, single-flight refresh with retry-once, the post-refresh disambiguation algorithm, the forced password-change screen, logout, relative-only deep-link preservation, and treating the server's own 403 as authoritative regardless of what permission-aware rendering chose to show.

### Modified Capabilities
- `authentication`: the CSRF cookie's lifetime is now specified (persists at least as long as the refresh credential, rather than as a session cookie), and the session-refresh requirement now states explicitly that a caller integration must serialize its own refresh attempts, since the server treats any second presentation of a credential as reuse regardless of intent.
- `authorization`: adds that a staff member's own effective permission keys and Owner status are readable from the endpoint returning their own account, for client rendering only, with no effect on enforcement.

## Impact

- **Affected code**: `apps/admin/src/App.tsx` (routes + guard), `apps/admin/src/lib/api.ts` (single-flight refresh in `apiFetch`/`apiUpload`), a new session/auth API module and hook or context, new sign-in and forced-password-change pages, a logout control. `apps/api/src/lib/csrf.ts` and `apps/api/src/lib/cookies.ts` (CSRF cookie `maxAge`), `apps/api/src/middleware/authorize.ts` (carry `permissionKeys` on `req.staffRole`), `apps/api/src/modules/users/user.mapper.ts` / `user.service.ts` / `user.controller.ts` (the two new DTO fields).
- **Docs**: none required. `docs/ARCHITECTURE.md` §5.3/§5.5 already describe the mechanics this change fixes and extends; neither section asserts anything this change contradicts.
- **Dependencies**: none new. The existing `apiFetch`/`apiUpload` wrapper and plain-hook pattern already used by every other admin screen (`TaxonomyManagementPage.tsx`, `useAsyncAction.ts`) is reused rather than introducing TanStack Query or react-hook-form, which `docs/ARCHITECTURE.md` §8.2 names aspirationally but which no admin screen currently uses.
- **Migration**: none. No schema change; the CSRF cookie and `GET /users/me` changes are backward-compatible additions to an existing cookie's attributes and an existing response body.
