## 1. Authenticated fetch client

- [ ] 1.1 Add `apps/web/lib/authApi.ts` with a raw fetch helper: `credentials: 'include'`, the `x-csrf-token` header read from the script-readable `csrf_token` cookie, envelope unwrapping, and an `ApiError` carrying `status` and `code`. It takes no caching options — see design.md, "Two fetch clients, not one client with an authenticated mode".
- [ ] 1.2 Add the readable-cookie check used by the anonymous fast path, as a named export so it can be tested directly.
- [ ] 1.3 Implement single-flight `refreshSession()` calling `POST /auth/refresh` outside the recovery cycle, resolving to a boolean and never throwing.
- [ ] 1.4 Implement single-flight `bootstrapCsrfCookie()` calling `GET /auth/csrf` outside the recovery cycle.
- [ ] 1.5 Implement the recovery wrapper: 401 → refresh → retry once; 403 `csrf_failed` → re-pair → retry once; at most one retry total across both paths, no chaining between them.
- [ ] 1.6 Expose `getReaderAccount()` (`GET /auth/me`, returning `ReaderAccountResponse` from `@siders/contracts`) and `signOutReader()` (`POST /auth/logout`), both through the recovery wrapper.
- [ ] 1.7 Leave `apps/web/lib/api.ts` unmodified and confirm nothing in it imports the new module.

## 2. Client tests for the recovery cycle

- [ ] 2.1 Test that no fetch is issued at all when the `csrf_token` cookie is absent.
- [ ] 2.2 Test that a 401 triggers exactly one refresh and one retry, and that a successful retry resolves to the account.
- [ ] 2.3 Test that a failed refresh resolves to anonymous with no retry.
- [ ] 2.4 Test that a retry rejected again triggers no second refresh or retry.
- [ ] 2.5 Test that concurrent 401s share exactly one in-flight refresh.
- [ ] 2.6 Test that a 403 `csrf_failed` re-pairs and retries once, and never refreshes.
- [ ] 2.7 Test that recovery paths do not chain — a request retried after re-pairing is not then refreshed.
- [ ] 2.8 Test that the CSRF header is sent on state-changing requests and matches the cookie value.

## 3. Reader session provider

- [ ] 3.1 Add `apps/web/lib/readerSession.tsx` as a Client Component exporting `ReaderSessionProvider` and `useReaderSession()`, with state `loading | anonymous | authenticated`.
- [ ] 3.2 Probe once on mount via `getReaderAccount()`; resolve `anonymous` immediately and without a fetch when the cookie check fails.
- [ ] 3.3 Implement `signOut()` that calls `signOutReader()` and resolves to `anonymous` regardless of the call's outcome.
- [ ] 3.4 Wrap `children` in `app/layout.tsx` with the provider, changing no page's caching directives and adding no `cookies()` call anywhere in the tree.

## 4. Provider tests

- [ ] 4.1 Test that an anonymous visitor resolves to `anonymous` without a network call.
- [ ] 4.2 Test that a successful probe resolves to `authenticated` with the account.
- [ ] 4.3 Test that sign-out resolves to `anonymous` when the call succeeds and when it fails.

## 5. Masthead utility slot

- [ ] 5.1 Add a `ReaderControl` component: sign-in link when anonymous, name plus avatar plus sign-out when authenticated, nothing signed-in-looking while loading.
- [ ] 5.2 Build the sign-in href as `${API_URL}/auth/google?next=` with the current in-app location URL-encoded, and confirm it is a plain anchor performing a full document navigation.
- [ ] 5.3 Handle the null-avatar case without a broken image.
- [ ] 5.4 Render the control in `StickyNav`'s existing right-hand space.
- [ ] 5.5 Render the control in a dedicated row above `SiteHeader`'s top rule, styled as masthead furniture per design.md — small, uppercase, sans, muted ink.

## 6. Masthead tests

- [ ] 6.1 Test that the anonymous state renders a sign-in control and no reader identity.
- [ ] 6.2 Test that the authenticated state renders the name and a sign-out control.
- [ ] 6.3 Test that the loading state renders no signed-in presentation.
- [ ] 6.4 Test that the sign-in href carries the current in-app location as `next` and names no other origin.

## 7. Caching verification

- [ ] 7.1 Confirm `revalidate = 60` still holds on `app/page.tsx` and `app/news/[slug]/page.tsx`, and that `/news` still uses `cache: 'no-store'`.
- [ ] 7.2 Confirm the build output still reports `/` and `/news/[slug]` as statically prerendered, and that no route became dynamic.
- [ ] 7.3 Confirm no reader-identifying content appears in prerendered output.

## 8. Manual end-to-end pass

- [ ] 8.1 Sign in from an article and confirm return to that same article.
- [ ] 8.2 Confirm the name and avatar appear in both the masthead row and the sticky bar.
- [ ] 8.3 Expire the access cookie (wait past 15 minutes or delete `sid_at`), reload, and confirm the reader stays signed in via one refresh.
- [ ] 8.4 Sign out and confirm the anonymous state returns without a page reload.
- [ ] 8.5 Load a page with no cookies and confirm the network panel shows no request to `/auth/me`, `/auth/refresh`, or `/auth/csrf`.
- [ ] 8.6 Ban the signed-in reader in the database, reload, and confirm the anonymous state with no explanatory message.

## 9. Configuration and completion

- [ ] 9.1 Document the `COOKIE_DOMAIN` requirement for any deployment where `apps/web` and `apps/api` are on different subdomains, and the per-environment `GOOGLE_REDIRECT_URI` registration.
- [ ] 9.2 Run build, lint, and the full test suite; confirm no TypeScript errors and no `any`.
