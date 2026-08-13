# Review report

**Verdict:** Approve with changes

## Reviewed at

| Range | Files | +/- | Date |
|---|---|---|---|
| `origin/main...HEAD` | 48 | +3217 / -48 | 2026-08-13 |

PR #8, head `873832f` (`feat(spec): add admin login`) on `add-admin-login`. This range covers the whole change: the three spec commits plus the implementation.

## Summary

This is the implementation of `add-admin-login` — the backend CSRF-lifetime fix, the `GET /auth/csrf` re-pairing endpoint, `permissionKeys`/`isOwner` on `GET /users/me`, and the full admin session lifecycle (session client, recovery interceptor, route guards, sign-in, forced password change, logout, permission-aware nav). It is good work. **432 tests pass across 59 files, `pnpm typecheck` is clean across all 6 workspace projects, and `pnpm lint` is clean** — I ran all three rather than taking the tasks file's word for it.

The hard parts are right. Single-flight refresh and bootstrap are correctly memoized promises cleared in `.finally`; the retry-once bound is a single boolean threaded through `withRecovery`, so neither path can chain into the other; refresh, bootstrap and the disambiguation re-probe all use `rawFetch` and so never re-enter the interceptor; `resolveSessionForCsrfBootstrap` is a genuinely read-only lookup that cannot rotate, revive or extend anything; and the `permissionKeys` plumbing sources from `req.staffRole` with a narrower `StaffUserQueryRow` keeping the repository honest. The interceptor's 14 tests include every concurrency scenario the spec calls for.

One Major finding drives the verdict, and it is not a code defect: `tasks.md` was reverted to its pre-review wording for tasks 2.1, 2.7, 2.8 and 5.1 and then marked complete, while the spec deltas and `design.md` were left carrying those requirements. Three accepted review items are consequently unbuilt but read as done.

## Findings

| # | Severity | Aspect(s) | File:line | Title |
|---|---|---|---|---|
| 1 | Major | correctness, conventions | `openspec/changes/add-admin-login/tasks.md:17` | `tasks.md` reverted to pre-review wording and marked complete, leaving three spec requirements unimplemented |
| 2 | Minor | conventions | `apps/admin/src/lib/sessionApi.ts:51` | `sessionApi.refresh`/`bootstrapCsrf` are unused and route through the interceptor the spec exempts them from |
| 3 | Minor | security | `apps/admin/src/session/redirectTarget.ts:18` | `resolveInAppTarget` rejects `//` but not `/\`, which the URL parser treats identically |
| 4 | Nit | hygiene | `apps/admin/src/App.tsx:42` | The forced password-change screen sits outside `AppShell`, so it carries no sign-out control |

## Details

### 1. `tasks.md` reverted and marked complete — Major

`git diff 846e6fb 873832f` over `openspec/changes/add-admin-login/specs/` and `design.md` is **empty**: the spec deltas still carry every requirement added in the fix pass for the PR review. But `tasks.md` had four of them removed and was then checked off. Tasks 2.1, 2.7, 2.8 and 5.1 now read exactly as they did *before* `846e6fb`.

Most visibly, task 2.8 went from a two-sentence keying-and-`onLimited` requirement back to its original one-liner:

```diff
-- [ ] 2.8 Key the limiter on the presented refresh credential (a hash of `sid_rt`…),
-         falling back to `clientIp` only when the caller presents no credential at all…
-         Give the limiter its own `onLimited` returning 204… Add a rate-limit test…
++ [x] 2.8 Add a rate-limit test for the endpoint, consistent with the extended
+         `specs/authentication` - "Authentication attempts are rate limited" requirement
```

Three concrete gaps follow. The task list reports 45/49 done, with only the four manual-QA items outstanding, so none of these is visible from it.

**(a) `password_change_required` has no implementation at all.** `specs/admin-session/spec.md:153-155` requires that a 403 with this code re-resolve session state and show the forced-change screen, attempting neither recovery. `grep -rn "password_change_required" apps/admin/src` returns **nothing**. In `api.ts:226` the code falls through to `throw err` — it correctly attempts neither recovery, but never re-resolves or routes, so the rejection surfaces through `useAsyncAction` as a generic permission denial. Reachability is narrow, as the spec itself notes (`triggerReset` revokes the target's sessions, so the flag cannot flip under a live session), which is why this is part of a Major rather than one on its own.

**(b) The rate limiter still keys on IP.** `design.md:65` — the paragraph added in response to the review — says to key on the presented refresh credential where one exists, falling back to `clientIp` only for credential-less callers. `auth.routes.ts:94` is `keyGenerator: clientIp`. The `onLimited` half *was* implemented correctly (`respondWithCsrfBootstrapNoop` returns a uniform 204, `auth.routes.ts:85-87`), so only the keying half is missing.

**(c) No test for the revoked-`sid_at` scenario.** `specs/authentication/spec.md:117-119` says a token may still be issued for a cryptographically valid `sid_at` whose session has since been revoked, and that every downstream check still rejects it. `auth.routes.csrf.test.ts` has nine tests but none covers this; the closest, *"issues no token for a revoked or expired refresh credential"*, is the `sid_rt` branch.

**Fix.** Restore the four task texts from `846e6fb` and uncheck 2.1, 2.7, 2.8 and 5.1 until each is actually met. Then add the third `withRecovery` branch, key `csrfBootstrapRateLimiter` on `sha256Hex` of `sid_rt` with a `clientIp` fallback, and add the revoked-`sid_at` test.

### 2. Dead session API methods bypass the interceptor exemption — Minor

`specs/admin-session/spec.md:74` names exactly three requests the interceptor must not wrap: `POST /auth/refresh`, `GET /auth/csrf`, and the disambiguation re-probe. `api.ts` gets this right internally — `refreshSession`, `bootstrapCsrfCookie` and `probeSession` all use `rawFetch`.

But `sessionApi` exports `refresh()` and `bootstrapCsrf()` built on `apiFetch`, which *is* the interceptor. Neither has a caller — `grep` finds only the definitions — so nothing is broken today. They are dead code shaped exactly like the trap the spec exists to prevent, and they are what the next person wiring a manual refresh will reach for.

**Fix.** Delete both. If they are kept for symmetry with task 4.1's endpoint list, build them on a non-intercepted path and say in a comment why they bypass `apiFetch`, so the exemption is visible where the method is defined.

### 3. `resolveInAppTarget` misses the backslash form — Minor

The guard rejects a candidate that does not start with `/`, or that starts with `//`. For http/https the WHATWG URL parser normalizes backslash to slash, so `/\evil.com` is equivalent to `//evil.com`. Verified:

```
new URL('/\\evil.com', 'https://admin.siders.id').href  →  https://evil.com/
```

That input starts with `/` and not with `//`, so it passes both checks and is returned verbatim.

I could not construct a reachable exploit in the current wiring, and want to be straight about that: the only producer of `from` is `RequireSession` writing react-router's own already-normalized location, and the value goes to `navigate()`, whose `pushState` throws `SecurityError` on a cross-origin resolution rather than navigating. So this is defense-in-depth, not a live open redirect. It still deserves closing — the function's stated contract is that only a relative same-app path is ever honored, it deliberately mirrors a server-side allowlist, and one refactor to `window.location.assign` would make it exploitable.

**Fix.** Reject backslashes alongside the existing checks — `/^\/(?![/\\])/` — and add `'/\\evil.com'` and `'/\\\\evil.com'` cases next to the existing protocol-relative test.

### 4. No sign-out on the forced-change screen — Nit

`/change-password` renders inside `RequireSession` but outside `AppShell`, which is the only place the sign-out button lives, so a caller confined there has no affordance to leave. In practice they arrived with a working temporary password from an admin reset and can complete the change, and keeping navigation out of a confinement screen is defensible. Noted so the omission is deliberate rather than incidental; if you want an escape hatch, put a bare sign-out button on `ChangePasswordPage` rather than pulling the screen inside `AppShell`.

## Rule check

| Rule | Where | Complies |
|---|---|---|
| Build, lint, tests, no TS errors before completion | `CLAUDE.md` | Yes — 432/432 tests, `typecheck` clean across 6 projects, `lint` clean. Verified by running them |
| TypeScript strict; never `any` | `CLAUDE.md` | Yes — no `any` in the diff; `unknown` used correctly in `resolveInAppTarget` and the error envelope guard |
| Small focused functions; no duplicated logic | `CLAUDE.md` | Yes — `withRecovery` is shared by `apiFetch`/`apiUpload`; `rawFetch`/`rawUpload` split cleanly from the recovery layer |
| Typed `AppError` subclasses, formatted once in `errorHandler` | `CLAUDE.md` | Yes — the new endpoint adds no error shape; the limiter's `onLimited` responds directly rather than inventing one |
| Hooks over classes; reusable components | `CLAUDE.md` | Yes — `SessionProvider`/`useSession`, guards as components, `useAsyncAction` reused |
| Lazy-load large features | `CLAUDE.md` | Yes — the Tiptap editor route stays lazy under the new guard nesting |
| Interceptor exempts refresh, bootstrap, re-probe | `specs/admin-session:74` | Partly — correct inside `api.ts`, contradicted by the dead `sessionApi` methods (finding 2) |
| Single-flight refresh; retry at most once across both paths | `specs/admin-session:72,97` | Yes — memoized promises, single `alreadyRetried` flag, 14 tests including concurrency |
| 403 after refresh disambiguated by re-probe, never assumed | `specs/admin-session:116` | Yes — `probeSession` via `rawFetch`, both outcomes tested |
| Third 403 code routes to the change screen | `specs/admin-session:153` | **No** — finding 1(a) |
| CSRF cookie persists as long as the refresh credential | `specs/authentication:6` | Yes — all three issuance points pass `REFRESH_TOKEN_MAX_AGE_MS`; `clearCsrfCookie` verified unaffected |
| Re-pairing endpoint never rotates, creates, extends, or unrevokes | `specs/authentication:99` | Yes — `resolveSessionForCsrfBootstrap` is read-only and deliberately not `refresh()` |
| Throttled re-pairing call returns the uniform 204 | `specs/authentication:68` | Yes — `respondWithCsrfBootstrapNoop` |
| Re-pairing limiter keyed per credential, not bare IP | `design.md:65` | **No** — finding 1(b) |
| Enforcement never moves to the client | `specs/admin-session:172` | Yes — `AppShell` gates rendering only; `useAsyncAction` still treats a 403 as authoritative |
| Generic sign-in failure, never branching on `code` | `specs/admin-session:56` | Yes — one `GENERIC_FAILURE_MESSAGE`, bare `catch` with no code inspection |
| Deep-link targets relative-only | `specs/admin-session:26` | Mostly — finding 3 |

## Next steps

1. Finding 1 is the one to act on before merge — restore the reverted task texts, then close (a), (b) and (c). Each is small; (a) is a branch plus a listener call, (b) is a key generator, (c) is one test.
2. Findings 2 and 3 are a deletion and a one-line regex.
3. The four manual QA items (11.4–11.7) remain genuinely outstanding — they need a running app and cannot be satisfied from the test suite.

*Local review only — nothing was committed, pushed, or posted to GitHub.*
