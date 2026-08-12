## 1. Backend — CSRF cookie lifetime (defect fix)

- [ ] 1.1 Export a shared refresh-lifetime constant from `apps/api/src/lib/cookies.ts` (currently the private `REFRESH_TOKEN_MAX_AGE_MS`) so `apps/api/src/lib/csrf.ts` can reuse it instead of duplicating the literal
- [ ] 1.2 Extend `setCsrfCookie` (`apps/api/src/lib/csrf.ts`) to accept and set a `maxAge` of at least that constant, so the cookie is no longer a session cookie
- [ ] 1.3 Update all three call sites to pass it: staff login (`auth.routes.ts:120`), refresh (`auth.controller.ts:26`), and the Google callback (`google.routes.ts:114`) — the fix must cover the reader flow too, since all three share `setCsrfCookie`
- [ ] 1.4 Add/extend tests asserting the CSRF cookie carries the new `maxAge` from all three issuance points, and that `clearCsrfCookie` on logout is unaffected

## 2. Backend — expose effective permissions on GET /users/me

- [ ] 2.1 Extend `StaffRoleContext` (`apps/api/src/middleware/authorize.ts`) with `permissionKeys: string[]`, populated in both `requireStaff` and `requirePermission` from the `access.permissionKeys` each already resolves via `resolveStaffAccess`
- [ ] 2.2 Extend `StaffUserRow`/`StaffUserDto` (`apps/api/src/modules/users/user.mapper.ts`) with `permissionKeys: string[]` and `isOwner: boolean`
- [ ] 2.3 Update `user.controller.ts`'s `getMe` to source both new fields from `req.staffRole` rather than issuing a second query
- [ ] 2.4 Update `toStaffUserDto` accordingly; confirm no other raw role/permission data leaks beyond the two new fields
- [ ] 2.5 Add/extend tests: reported permissions match the caller's role exactly; Owner reports `isOwner: true` even with zero explicit permission rows; a role or permission change is reflected on the next call; removing a permission after it was reported does not affect enforcement on a subsequent request

## 3. Frontend — session API client

- [ ] 3.1 Add a session/auth API module (alongside the existing `taxonomyApi.ts` / `articlesApi.ts` pattern) wrapping `POST /auth/staff/login`, `GET /users/me`, `POST /staff/me/password`, `POST /auth/refresh`, `POST /auth/logout`
- [ ] 3.2 Route every call through the existing `apiFetch` (`apps/admin/src/lib/api.ts`) rather than a parallel fetch path, so CSRF header attachment and credential handling stay in one place

## 4. Frontend — single-flight refresh interceptor

- [ ] 4.1 In `apps/admin/src/lib/api.ts`, wrap `apiFetch`/`apiUpload` so a 403 response triggers refresh-then-retry, sharing one in-flight refresh promise across concurrent callers instead of each issuing its own
- [ ] 4.2 Cap retries at one per originating request — a still-403 retry does not trigger a second refresh for that request
- [ ] 4.3 Exclude the sign-in screen's own credential-submission request from this interceptor entirely
- [ ] 4.4 On a refresh call that itself does not succeed, resolve to a "session gone" outcome without retrying the original request
- [ ] 4.5 On a retry that still 403s, re-probe `GET /users/me` and resolve to "permission denied" (probe succeeds) or "session gone" (probe fails)
- [ ] 4.6 Add a concurrency test: N simultaneous 403s across independent calls produce exactly one `/auth/refresh` request

## 5. Frontend — route guard and boot probe

- [ ] 5.1 Add a session context/hook that resolves session state once on boot via the probe + recovery algorithm from section 4, and exposes it to the route tree
- [ ] 5.2 Wrap `apps/admin/src/App.tsx`'s routes, other than `/login`, in a guard that redirects to `/login` when no session resolves, preserving the requested path
- [ ] 5.3 Redirect an already-signed-in caller away from `/login` into the app
- [ ] 5.4 Restrict the preserved / post-sign-in redirect target to relative in-app paths; discard anything absolute, protocol-relative, or cross-origin in favor of the default landing route

## 6. Frontend — sign-in screen

- [ ] 6.1 Replace the `LoginPage` stub in `apps/admin/src/App.tsx` with a real form posting to the session API module from section 3
- [ ] 6.2 On success, read the caller's own account to decide between the forced password-change screen and the preserved/default target (the sign-in response itself carries no body to decide from)
- [ ] 6.3 On failure, show one fixed generic message regardless of the server's `code` — do not branch on `code` to surface a distinct "throttled" state, and do not indicate which field was wrong

## 7. Frontend — forced password-change screen

- [ ] 7.1 Add a screen that calls `POST /staff/me/password`, shown whenever the probed account reports `mustChangePassword`
- [ ] 7.2 Block navigation to every other route while the flag is set, sourcing the check from the caller's own account state rather than a client-side assumption made at sign-in
- [ ] 7.3 Re-resolve session state after a successful change so the restriction lifts without a fresh sign-in

## 8. Frontend — logout

- [ ] 8.1 Add a logout control reachable from within the app that calls `POST /auth/logout`, clears local session/account state, and navigates to `/login` regardless of the call's outcome

## 9. Frontend — permission-aware rendering

- [ ] 9.1 Use the `permissionKeys` / `isOwner` fields from section 2 to decide which navigation items and permission-gated controls render, following the existing pattern (`useAsyncAction.ts`, `TaxonomyManagementPage.tsx`) of treating a 403 as authoritative rather than introducing a second, client-only permission model
- [ ] 9.2 Confirm every gated action still goes through the normal request path regardless of what was rendered, and that a 403 on it is surfaced exactly as it is today

## 10. Verification

- [ ] 10.1 Cover every scenario in `specs/admin-session/spec.md` with a test; the single-flight and re-probe algorithms need concurrency tests, not only sequential ones
- [ ] 10.2 Cover the two modified `authentication` scenarios (CSRF cookie survives a browser restart; a raced second presentation is treated as reuse) and the four added `authorization` scenarios
- [ ] 10.3 Manual QA: sign in, wait past 15 idle minutes, confirm a subsequent action recovers silently instead of bouncing to `/login`
- [ ] 10.4 Manual QA: close and reopen the browser within the refresh window and confirm sign-in, refresh, and logout all still work (the browser-restart lockout this change fixes)
- [ ] 10.5 Manual QA: force a `mustChangePassword` account through sign-in → forced change → app, and confirm a role/permission edit made mid-session is reflected in rendered navigation after the next probe
