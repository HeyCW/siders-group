## 1. Backend — CSRF cookie lifetime (defect fix)

- [ ] 1.1 Export a shared refresh-lifetime constant from `apps/api/src/lib/cookies.ts` (currently the private `REFRESH_TOKEN_MAX_AGE_MS`) so `apps/api/src/lib/csrf.ts` can reuse it instead of duplicating the literal
- [ ] 1.2 Extend `setCsrfCookie` (`apps/api/src/lib/csrf.ts`) to accept and set a `maxAge` of at least that constant, so the cookie is no longer a session cookie
- [ ] 1.3 Update all three call sites to pass it: staff login (`auth.routes.ts:120`), refresh (`auth.controller.ts:26`), and the Google callback (`google.routes.ts:114`) — the fix must cover the reader flow too, since all three share `setCsrfCookie`
- [ ] 1.4 Add/extend tests asserting the CSRF cookie carries the new `maxAge` from all three issuance points, and that `clearCsrfCookie` on logout is unaffected

## 2. Backend — CSRF bootstrap/recovery endpoint

- [ ] 2.1 Add `GET /auth/csrf` in `apps/api/src/modules/auth/auth.routes.ts`, declared `requirePublic()` and rate-limited: mirror `refreshRateLimiter()`'s exported-factory pattern so tests can exercise the real configuration, but give it its own key generator and its own `onLimited` (see 2.8) rather than reusing `refreshRateLimiter`'s IP-only key or its 401 `onLimited` — both are wrong for this endpoint (design.md - "That forced GET is nonetheless chargeable")
- [ ] 2.2 Resolve binding in order: if `req.auth` is set (a cryptographically valid `sid_at`), bind to `req.auth.sessionId`; otherwise resolve `sid_rt` the same way `auth.service.ts`'s `refresh()` looks up a refresh credential (hash match, unrevoked, unexpired) and bind to that session; otherwise issue nothing
- [ ] 2.3 Derive the binding only from the caller's own cookies — never from a query parameter, header, or request body
- [ ] 2.4 Issue the new token via `setCsrfCookie` exactly as every other issuance point does; never include it in the response body
- [ ] 2.5 Respond identically (204, no body) regardless of which binding branch fired or whether one fired at all, so the endpoint is not an oracle for session state
- [ ] 2.6 Confirm the endpoint never rotates a refresh credential, never creates or extends a session, and never lifts a revocation — it only calls `setCsrfCookie`, nothing that touches `app.sessions`
- [ ] 2.7 Add/extend tests: recovery with only `sid_rt` held; recovery with a valid `sid_at` held, and that the resulting cookie's binding then passes `createCsrfMiddleware`'s check on a subsequent state-changing request (the window a `sid_rt`-only fix would miss); no token issued with neither credential, and no token issued for a revoked or expired `sid_rt`; a token may still be issued for a cryptographically valid `sid_at` whose session has since been revoked, and a subsequent state-changing request against that session is still rejected despite carrying the new token; the response is identical across all of the above; no session row is created, rotated, or unrevoked by calling it
- [ ] 2.8 Key the limiter on the presented refresh credential (a hash of `sid_rt`, matching how `2.2` already resolves it) when one is present, falling back to `clientIp` only when the caller presents no credential at all — so a hostile page forcing credential-less requests, or many staff members recovering behind one NAT, cannot spend a caller's own recovery budget for them. Give the limiter its own `onLimited` returning 204 with no cookie set, matching this endpoint's own uniform response (`2.5`) rather than `refreshRateLimiter`'s 401 — `apps/api/src/middleware/rateLimit.ts`'s `onLimited` is a required field for exactly this reason, since the response shape is per endpoint. Add a rate-limit test for the endpoint, consistent with the extended `specs/authentication` - "Authentication attempts are rate limited" requirement

## 3. Backend — expose effective permissions on GET /users/me

- [ ] 3.1 Extend `StaffRoleContext` (`apps/api/src/middleware/authorize.ts`) with `permissionKeys: string[]`, populated in both `requireStaff` and `requirePermission` from the `access.permissionKeys` each already resolves via `resolveStaffAccess`
- [ ] 3.2 Extend `StaffUserRow`/`StaffUserDto` (`apps/api/src/modules/users/user.mapper.ts`) with `permissionKeys: string[]` and `isOwner: boolean`
- [ ] 3.3 Update `user.controller.ts`'s `getMe` to source both new fields from `req.staffRole` rather than issuing a second query
- [ ] 3.4 Update `toStaffUserDto` accordingly; confirm no other raw role/permission data leaks beyond the two new fields
- [ ] 3.5 Add/extend tests: reported permissions match the caller's role exactly; Owner reports `isOwner: true` even with zero explicit permission rows; a role or permission change is reflected on the next call; removing a permission after it was reported does not affect enforcement on a subsequent request

## 4. Frontend — session API client

- [ ] 4.1 Add a session/auth API module (alongside the existing `taxonomyApi.ts` / `articlesApi.ts` pattern) wrapping `POST /auth/staff/login`, `GET /users/me`, `POST /staff/me/password`, `POST /auth/refresh`, `POST /auth/logout`, and `GET /auth/csrf`
- [ ] 4.2 Route every call through the existing `apiFetch` (`apps/admin/src/lib/api.ts`) rather than a parallel fetch path, so CSRF header attachment and credential handling stay in one place

## 5. Frontend — interceptor: refresh recovery and CSRF bootstrap recovery

- [ ] 5.1 In `apps/admin/src/lib/api.ts`, wrap `apiFetch`/`apiUpload` so a 403 response is inspected by its `code` before choosing a recovery path — `forbidden` triggers refresh-then-retry, `csrf_failed` triggers bootstrap-then-retry, `password_change_required` re-resolves session state into the forced password-change screen and attempts neither, and a single rejection is never routed down more than one path. The wrapper excludes `POST /auth/refresh`, `GET /auth/csrf`, and the disambiguation re-probe in 5.7 from itself, per `specs/admin-session` - "Refresh is single-flight"
- [ ] 5.2 Refresh path: share one in-flight refresh promise across concurrent `forbidden` rejections instead of each issuing its own
- [ ] 5.3 Bootstrap path: call `GET /auth/csrf` then retry, sharing one in-flight bootstrap promise across concurrent `csrf_failed` rejections instead of each issuing its own
- [ ] 5.4 Cap retries at one per originating request across both paths combined — a request already retried once, by either path, is not retried again by the other
- [ ] 5.5 Exclude the sign-in screen's own credential-submission request from the refresh path entirely; explicitly include it in the bootstrap path — a `csrf_failed` on sign-in is exactly the locked-out state this mechanism exists to recover
- [ ] 5.6 On a refresh call that itself does not succeed, resolve to a "session gone" outcome without retrying the original request
- [ ] 5.7 On a refresh-recovered retry that still 403s, re-probe `GET /users/me` and resolve to "permission denied" (probe succeeds) or "session gone" (probe fails)
- [ ] 5.8 Add concurrency tests: N simultaneous `forbidden` rejections produce exactly one `/auth/refresh` call; N simultaneous `csrf_failed` rejections produce exactly one `/auth/csrf` call; a mix of both produces exactly one of each, not one of the other
- [ ] 5.9 Add a test for the sign-in-specific path: a `csrf_failed` on `POST /auth/staff/login` triggers bootstrap and one retry of the sign-in submission, and never attempts a refresh for that same rejection

## 6. Frontend — route guard and boot probe

- [ ] 6.1 Add a session context/hook that resolves session state once on boot via the probe + recovery algorithm from section 5, and exposes it to the route tree
- [ ] 6.2 Wrap `apps/admin/src/App.tsx`'s routes, other than `/login`, in a guard that redirects to `/login` when no session resolves, preserving the requested path
- [ ] 6.3 Redirect an already-signed-in caller away from `/login` into the app
- [ ] 6.4 Restrict the preserved / post-sign-in redirect target to relative in-app paths; discard anything absolute, protocol-relative, or cross-origin in favor of the default landing route

## 7. Frontend — sign-in screen

- [ ] 7.1 Replace the `LoginPage` stub in `apps/admin/src/App.tsx` with a real form posting to the session API module from section 4
- [ ] 7.2 On success, read the caller's own account to decide between the forced password-change screen and the preserved/default target (the sign-in response itself carries no body to decide from)
- [ ] 7.3 On failure, show one fixed generic message regardless of the server's `code` — do not branch on `code` to surface a distinct "throttled" state, and do not indicate which field was wrong. Note this is deliberately different from the interceptor's own `code`-branching in section 5: that branching selects a *recovery mechanism*, this one must not leak into what the *user* sees
- [ ] 7.4 Confirm a `csrf_failed` on submission is recovered per section 5.5/5.9 before any generic failure message is shown — the failure message is for a genuinely rejected attempt, not for a stale-cookie retry that goes on to succeed

## 8. Frontend — forced password-change screen

- [ ] 8.1 Add a screen that calls `POST /staff/me/password`, shown whenever the probed account reports `mustChangePassword`
- [ ] 8.2 Block navigation to every other route while the flag is set, sourcing the check from the caller's own account state rather than a client-side assumption made at sign-in
- [ ] 8.3 Re-resolve session state after a successful change so the restriction lifts without a fresh sign-in

## 9. Frontend — logout

- [ ] 9.1 Add a logout control reachable from within the app that calls `POST /auth/logout`, clears local session/account state, and navigates to `/login` regardless of the call's outcome

## 10. Frontend — permission-aware rendering

- [ ] 10.1 Use the `permissionKeys` / `isOwner` fields from section 3 to decide which navigation items and permission-gated controls render, following the existing pattern (`useAsyncAction.ts`, `TaxonomyManagementPage.tsx`) of treating a 403 as authoritative rather than introducing a second, client-only permission model
- [ ] 10.2 Confirm every gated action still goes through the normal request path regardless of what was rendered, and that a 403 on it is surfaced exactly as it is today

## 11. Verification

- [ ] 11.1 Cover every scenario in `specs/admin-session/spec.md` with a test; the single-flight refresh, single-flight bootstrap, and re-probe algorithms need concurrency tests, not only sequential ones
- [ ] 11.2 Cover the `authentication` scenarios this change adds or modifies: CSRF cookie survives a browser restart; a raced second refresh presentation is treated as reuse; the CSRF re-pairing endpoint's four scenarios (recovery via `sid_rt` only, recovery via a valid `sid_at`, no token when no session is identifiable, no rotation/revival); and the CSRF re-pairing rate-limit scenario
- [ ] 11.3 Cover the four scenarios added to `authorization` for `permissionKeys`/`isOwner`
- [ ] 11.4 Manual QA: sign in, wait past 15 idle minutes, confirm a subsequent action recovers silently instead of bouncing to `/login`
- [ ] 11.5 Manual QA: close and reopen the browser within the refresh window and confirm sign-in, refresh, and logout all still work (the browser-restart lockout the `maxAge` fix prevents from recurring)
- [ ] 11.6 Manual QA — deliberately reproduce and recover from the pre-fix lockout: sign in, then delete only the `csrf_token` cookie via devtools (leaving `sid_at`/`sid_rt` intact), and confirm sign-in, refresh, and logout all still recover on the next attempt via the bootstrap path. This is the locked-out state that 11.5 cannot otherwise reach, and is the highest-value manual check in this change
- [ ] 11.7 Manual QA: force a `mustChangePassword` account through sign-in → forced change → app, and confirm a role/permission edit made mid-session is reflected in rendered navigation after the next probe
