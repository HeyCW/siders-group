## 1. Authenticated fetch client

- [x] 1.1 Add `apps/web/lib/authApi.ts` with a raw fetch helper: `credentials: 'include'`, the `x-csrf-token` header read from the script-readable `csrf_token` cookie, envelope unwrapping, and an `ApiError` carrying `status` and `code`. It takes no caching options — see design.md, "Two fetch clients, not one client with an authenticated mode".
- [x] 1.2 Add the readable-cookie check used by the anonymous fast path, as a named export so it can be tested directly.
- [x] 1.3 Implement single-flight `refreshSession()` calling `POST /auth/refresh` outside the recovery cycle, resolving to a boolean and never throwing.
- [x] 1.4 Implement single-flight `bootstrapCsrfCookie()` calling `GET /auth/csrf` outside the recovery cycle — see spec.md, "A CSRF failure is recovered by re-pairing, not by refreshing".
- [x] 1.5 Implement the recovery wrapper: 401 → refresh → retry once; 403 `csrf_failed` → re-pair → retry once; at most one retry total across both paths, no chaining between them.
- [x] 1.6 Expose `getReaderAccount()` (`GET /auth/me`, returning `ReaderAccountResponse` from `@siders/contracts`) and `signOutReader()` (`POST /auth/logout`), both through the recovery wrapper.
- [x] 1.7 Leave `apps/web/lib/api.ts` unmodified and confirm nothing in it imports the new module.

## 2. Client tests for the recovery cycle

- [x] 2.1 Test that no fetch is issued at all when the `csrf_token` cookie is absent.
- [x] 2.2 Test that a 401 triggers exactly one refresh and one retry, and that a successful retry resolves to the account.
- [x] 2.3 Test that a failed refresh resolves to anonymous with no retry.
- [x] 2.4 Test that a retry rejected again triggers no second refresh or retry.
- [x] 2.5 Test that concurrent 401s share exactly one in-flight refresh.
- [x] 2.6 Test that a 403 `csrf_failed` re-pairs and retries once, and never refreshes.
- [x] 2.9 Test that concurrent `csrf_failed` rejections share exactly one in-flight re-pairing request.
- [x] 2.7 Test that recovery paths do not chain — a request retried after re-pairing is not then refreshed.
- [x] 2.8 Test that the CSRF header is sent on state-changing requests and matches the cookie value.

## 3. Reader session provider

- [x] 3.1 Add `apps/web/lib/readerSession.tsx` as a Client Component exporting `ReaderSessionProvider` and `useReaderSession()`, with state `loading | anonymous | authenticated`.
- [x] 3.2 Probe once on mount via `getReaderAccount()`; resolve `anonymous` immediately and without a fetch when the cookie check fails.
- [x] 3.3 Implement `signOut()` that calls `signOutReader()` and resolves to `anonymous` regardless of the call's outcome.
- [x] 3.4 Wrap `SiteHeader`, `children`, and `SiteFooter` together in `app/layout.tsx` with the provider — `SiteHeader` is where `ReaderControl` is rendered (tasks 5.4, 5.5), so it must be inside the provider too, not just `children`. Changes no page's caching directives and adds no `cookies()` call anywhere in the tree.

## 4. Provider tests

- [x] 4.1 Test that an anonymous visitor resolves to `anonymous` without a network call.
- [x] 4.2 Test that a successful probe resolves to `authenticated` with the account.
- [x] 4.3 Test that sign-out resolves to `anonymous` when the call succeeds and when it fails.

## 5. Masthead utility slot

- [x] 5.1 Add a `ReaderControl` component: sign-in link when anonymous, name plus avatar plus sign-out when authenticated, nothing signed-in-looking while loading.
- [x] 5.2 Build the sign-in href as `${API_URL}/auth/google?next=` with the current in-app location URL-encoded, and confirm it is a plain anchor performing a full document navigation.
- [x] 5.3 Handle the null-avatar case without a broken image.
- [x] 5.4 Render the control in `StickyNav`'s existing right-hand space.
- [x] 5.5 Render the control in a dedicated row above `SiteHeader`'s top rule, styled as masthead furniture per design.md — small, uppercase, sans, muted ink.

## 6. Masthead tests

- [x] 6.1 Test that the anonymous state renders a sign-in control and no reader identity.
- [x] 6.2 Test that the authenticated state renders the name and a sign-out control.
- [x] 6.3 Test that the loading state renders no signed-in presentation.
- [x] 6.4 Test that the sign-in href carries the current in-app location as `next` and names no other origin.
- [x] 6.5 Test that the sign-in href's `next` carries the query string on click — `usePathname()` alone drops it, which is why `/news`'s category filter needs the click-time `window.location` read in `ReaderControl.tsx`.

## 7. Caching verification

- [x] 7.1 Confirm `revalidate = 60` still holds on `app/page.tsx` and `app/news/[slug]/page.tsx`, and that `/news` still uses `cache: 'no-store'`.
- [x] 7.2 Confirm the build output still reports `/` and `/news/[slug]` as statically prerendered, and that no route became dynamic. Verified structurally (no `cookies()`, `headers()`, or dynamic export in any changed or new file — `git diff`/`grep` clean) and by a clean-`.next` `next build` producing an identical prerender failure/digest with and without this change when the API is unreachable, showing no new server-side data dependency was introduced. A full green build requires the API and a database, neither running in this environment; a build with a warm fetch cache did complete and reported `/` as `○ Static`.
- [x] 7.3 Confirm no reader-identifying content appears in prerendered output. Guaranteed structurally: `ReaderControl`'s account data is populated only inside `ReaderSessionProvider`'s `useEffect`, which never runs during server rendering — every prerendered/exported HTML pass renders it in the `loading` state (an empty `aria-hidden` span), so no reader data can reach static output.

## 8. Manual end-to-end pass

- [ ] 8.1 Sign in from an article and confirm return to that same article.
- [ ] 8.2 Confirm the name and avatar appear in both the masthead row and the sticky bar.
- [ ] 8.3 Expire the access cookie (wait past 15 minutes or delete `sid_at`), reload, and confirm the reader stays signed in via one refresh.
- [ ] 8.4 Sign out and confirm the anonymous state returns without a page reload.
- [ ] 8.5 Load a page with no cookies and confirm the network panel shows no request to `/auth/me`, `/auth/refresh`, or `/auth/csrf`.
- [ ] 8.6 Ban the signed-in reader in the database, reload, and confirm the anonymous state with no explanatory message.

## 9. Configuration and completion

- [x] 9.1 Document the `COOKIE_DOMAIN` requirement for any deployment where `apps/web` and `apps/api` are on different subdomains, and the per-environment `GOOGLE_REDIRECT_URI` registration. Already covered by `docs/ARCHITECTURE.md` §10 (production values and the "one registrable domain" rationale) and this change's own `proposal.md`/`design.md` — no new doc needed.
- [x] 9.2 Run build, lint, and the full test suite; confirm no TypeScript errors and no `any`. `tsc --noEmit` clean, `eslint` clean on all new/modified files, `vitest run` 43/43 passing across the whole `apps/web` suite (547/547 across the monorepo). `next build` could not be run to a fully clean success in this environment (no live API/database — see 7.2), but a clean-cache build produces an identical pre-existing prerender failure with and without this change, confirming no regression was introduced.
