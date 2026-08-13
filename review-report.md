# Review report

**Verdict:** Rejected with changes

## Reviewed at

| Range | Files | +/- | Date |
|---|---|---|---|
| `origin/main...HEAD` | 7 | +558 / -0 | 2026-08-13 |

Commits: `dfb6750` spec(admin-session), `3f9faf8` fix(admin-session).

This is the diff of **PR #8** (`add-admin-login` → `main`): head `3f9faf8`, base `e94d2b0`, 7 files, +558, 2 commits — identical on every axis to the range reviewed here.

## Summary

This change is **spec-only**: all 558 lines are the `openspec/changes/add-admin-login/` artifacts — proposal, design, three spec deltas, tasks. No application code is touched, and all 49 tasks are unchecked, so there is no implementation to review yet. What follows reviews the specification as the deliverable.

The quality is high. Every `file:line` citation in the proposal and design was checked against the code and **all of them are accurate** — `csrf.ts:61-64`'s options type, `server.ts:48`, `auth.routes.ts:110/84/90/24-26`, `user.routes.ts:17`, `staff.routes.ts:67`, `authorize.ts:10-13/136-161/110-114`, `google.routes.ts:114`, `auth.controller.ts:26`, `App.tsx:14-16`. Both defects it claims to have found are real and correctly diagnosed. The OpenSpec structure is well-formed: all three `MODIFIED` requirement headers match their baselines verbatim and reproduce every baseline scenario before adding new ones, so nothing is silently dropped on sync; `admin-session` is correctly a new capability; `.openspec.yaml` matches archived precedent. The design's alternatives-considered sections are substantive rather than decorative.

The verdict is driven by three Major findings, all narrow and all fixable in the spec without reopening the architecture: the recovery endpoint's rate limit is specified in a way that both denies the endpoint to the population it exists to serve and contradicts the change's own scenario, and the interceptor's scope is left undefined at exactly the boundary where it can recurse. The repo ships no review guide (`CONTRIBUTING.md`, `docs/reviewing.md`, `docs/code-review.md` all absent), so this review uses general standards plus `CLAUDE.md`, `docs/ARCHITECTURE.md`, and the in-repo precedent cited per finding.

## Findings

| # | Severity | Aspect(s) | File:line | Title |
|---|---|---|---|---|
| 1 | Major | security | `openspec/changes/add-admin-login/design.md:63` | Hostile page can exhaust the IP-keyed rate limit on `GET /auth/csrf` and re-lock the recovery path |
| 2 | Major | conventions, correctness | `openspec/changes/add-admin-login/tasks.md:10` | Task 2.1's "mirror `refreshRateLimiter()`" ships a 401 on throttle, failing the change's own scenario |
| 3 | Major | correctness | `openspec/changes/add-admin-login/specs/admin-session/spec.md:72` | "Feature route" is undefined, leaving the boot probe and the re-probe unscoped against recursion |
| 4 | Minor | correctness | `openspec/changes/add-admin-login/specs/admin-session/spec.md:113` | A third 403 code, `password_change_required`, has no branch in the interceptor |
| 5 | Minor | correctness | `openspec/changes/add-admin-login/specs/authentication/spec.md:93` | The `sid_at` binding branch contradicts the requirement's own "validly exists" guarantee |
| 6 | Nit | hygiene | `openspec/changes/add-admin-login/proposal.md:39` | "Docs: none required" checks only ARCHITECTURE.md §5.3/§5.5, not §8.1's fetch-wrapper description |
| 7 | Minor | conventions, correctness | `openspec/changes/add-admin-login/proposal.md:3` | Base drift: `App.tsx:14-16` is stale on current `main`, and two routes landed since that the change never counted |

## Details

### 1. Hostile page can exhaust the IP-keyed rate limit on `GET /auth/csrf` — Major

`design.md:63` names the `<img>`-triggered cross-origin GET and concludes the attacker gains nothing, because they cannot read the resulting `Set-Cookie`. That analysis is correct as far as it goes — and `sameSite: 'lax'` makes it stronger than the design claims, since no session cookies are attached to a cross-site subresource request at all, so no token is ever issued. But it covers *token theft* and stops short of *budget exhaustion*.

`rateLimit` charges the bucket **before** the handler runs (`apps/api/src/middleware/rateLimit.ts:88`), and `refreshRateLimiter` — the shape task 2.1 says to mirror — keys on `clientIp` with no `failuresOnly` (`apps/api/src/modules/auth/auth.routes.ts:68-75`). So every forced GET counts against the victim's IP even though it accomplishes nothing else. A hostile page can spend a victim's entire recovery budget with requests that are otherwise no-ops.

The no-attacker case is worse, because it is certain rather than hypothetical. The CSRF-lifetime defect is deterministic on browser restart, so an office of staff behind one NAT hits the lockout *together*. On the next morning they collectively drain a 30-per-15-minute IP bucket — and the population that gets throttled out of the recovery endpoint is precisely the population it was built for.

**Fix.** Do not charge the limiter for a request carrying no session credential; by this change's own spec those requests issue nothing. Key the recovery bucket on the presented refresh credential (e.g. `sha256Hex` of `sid_rt`) where one is present, keeping an IP-keyed cap only as a coarse flood guard with a budget well above one call per lockout. Add the reasoning to `design.md` next to the existing `<img>` paragraph, which currently ends one step early.

### 2. Task 2.1's "mirror `refreshRateLimiter()`" contradicts the change's own scenario — Major

`refreshRateLimiter` passes `onLimited: respondWithRefreshFailure`, which answers **401 `invalid_refresh_token`** (`auth.routes.ts:34-35, 68-75`). The change's own scenario requires a throttled re-pairing call to be *"indistinguishable from the endpoint's ordinary uniform response"* (`specs/authentication/spec.md:86-88`), and that response is **204** (task 2.5, and the `ADDED` requirement's uniformity clause). An implementer who follows task 2.1 literally ships code that fails the test task 2.8 mandates.

It also breaks an explicit in-repo rule. `rateLimit` documents `onLimited` as required, not optional, precisely because *"the spec's indistinguishability rule is per endpoint, so there is no correct default a limiter could fall back to"* (`apps/api/src/middleware/rateLimit.ts:21-31`). Borrowing another endpoint's handler is the exact mistake that comment exists to prevent.

Underneath the wording is a design question nobody has answered: a silent 204 on throttle leaves the client unable to distinguish successful recovery from refusal, so it retries once, fails, and drops the caller on the generic failure path with no indication why.

**Fix.** Drop "mirror `refreshRateLimiter()`'s shape" from task 2.1 and give the endpoint its own `onLimited` returning 204 with no cookie set. Keep the "export pattern" half of the instruction — that part matches the repo's convention of exercising shipped config in tests. State the consequence in `design.md`: a throttled caller is indistinguishable from an unrecoverable one and lands on the generic failure path.

### 3. "Feature route" is undefined, leaving the re-probe unscoped against recursion — Major

The refresh trigger is scoped to *"a request to a feature route"* (`specs/admin-session/spec.md:72`), a term the change never defines, and the only stated exemption is the sign-in submission. Two requests fall straight into the gap, and they need opposite treatment:

- **The boot probe** is `GET /users/me`, and the scenario at `spec.md:22-24` explicitly requires a 403 on it to attempt a refresh. So the probe must be **inside** the interceptor.
- **The re-probe** in the disambiguation algorithm is *also* `GET /users/me`, and it must be **outside**. The retry-once bound is per *originating request*, and the re-probe is a new originating request, not a retry — so an implementer who routes it through the wrapped `apiFetch` gets `refresh → retry → re-probe → refresh → …`. The requirement does say a failed re-probe means the session is gone, which terminates a compliant implementation, but nothing in the spec stops the probe from entering the interceptor in the first place.

The same ambiguity leaves `POST /auth/refresh` and `GET /auth/csrf` themselves unscoped, and both can answer 403.

**Fix.** State the interceptor's scope explicitly rather than by adjective: it wraps every request except `POST /auth/refresh`, `GET /auth/csrf`, and the disambiguation re-probe, which are issued outside it. The sign-in submission stays in the bootstrap path and out of the refresh path, as already specified. Add a scenario asserting the re-probe triggers no further refresh or bootstrap whatever it returns, and reword task 5.7 to say the probe bypasses the wrapper.

### 4. A third 403 code, `password_change_required`, has no branch — Minor

`requireStaff` and `requirePermission` answer **403 `password_change_required`** (`apps/api/src/middleware/authorize.ts:193-194, 225-226`), a code distinct from both `forbidden` and `csrf_failed`. The interceptor branches only on the latter two, so this one falls through to *"a resulting 403 SHALL be treated as authoritative"* and renders as a permission denial — the wrong outcome, since the caller should be routed to the forced-change screen.

Reachability is genuinely narrow, and the change is not wrong to have deprioritized it: `triggerReset` revokes every session for the target (`apps/api/src/modules/staff/staff.service.ts:112`), so the flag never flips under a live session. It is reached when the app issues any gated request while already in the pending-change state — which the "confines the app to the change screen" requirement prevents only as freshly as the last probe.

**Fix.** Add a third branch to the code-based routing: a 403 coded `password_change_required` re-resolves session state and enters the forced password-change screen, attempting neither refresh nor bootstrap. Add a matching scenario.

### 5. The `sid_at` branch contradicts the requirement's "validly exists" guarantee — Minor

The `ADDED` requirement asserts the mechanism *"only re-pairs a CSRF token with a session that already validly exists"*, and its no-token scenario covers a revoked or expired **refresh** credential. But binding branch one fires on `req.auth` alone, which `authenticate` populates from a stateless EdDSA check with no database read (`apps/api/src/middleware/authenticate.ts:24-35`). A session revoked in the last 15 minutes still has a live `sid_at`, so a token still gets issued.

Nothing is granted by this — `requireStaff` re-checks the session on the very next request, which is exactly the design's own argument — but the requirement promises an invariant the algorithm does not hold, and task 2.7's test list inherits the gap. The design is deliberate about branch one being stateless (`design.md:57` explains why both branches are necessary); it is the spec prose that overclaims.

**Fix.** Scope the guarantee to what the branch actually checks: the access-credential branch binds to the session named by a cryptographically valid access credential *without a database read*, and issuing a token there is explicitly not an assertion that the session is unrevoked. Add a scenario for a revoked session with a live access credential, asserting a token may be issued and that every downstream check still rejects it.

### 6. "Docs: none required" checks only §5.3/§5.5 — Nit

The claim at `proposal.md:39` is accurate for the two sections it names — neither asserts anything about CSRF cookie lifetime. But `docs/ARCHITECTURE.md:524` is the only place the codebase describes a fetch wrapper's recovery cycle, and it describes it as *"401 → refresh → retry"*. That is right for `apps/web`, where `requireReader` answers 401 (`authorize.ts:110-114`), and wrong for the admin wrapper this change introduces, where every staff rejection is a 403 — a distinction `design.md:89` reasons about carefully but never writes back into the docs. The next person implementing against §8.1 in `apps/admin` writes a guard that never fires.

**Fix.** One line in §8.2 noting the admin wrapper's cycle is 403-keyed with code-based branching, because staff rejections answer 403 where reader rejections answer 401.

### 7. Base drift: two routes landed since this change was written — Minor

Every citation in this change is accurate against its own merge-base (`ef42d4b`), which is what the PR diff is computed against. But `main` has advanced 13 commits since, and two of those changes land in files this change describes:

- **`apps/admin/src/App.tsx`** — PR #7 added `/reels` and `/reels-curation`. `LoginPage` is now at **`App.tsx:16-18`**, not the `14-16` cited in `proposal.md:3` and `design.md:3`, and the file now has **8 unguarded routes, not 6**. Task 6.2 is written by reference ("routes other than `/login`") so it still covers them, but the change's own narrative, Impact list, and QA plan were sized against six screens. Anyone verifying against the change's description will be two screens short.
- **`apps/api/src/middleware/rateLimit.ts`** — PR #7 added `publicReadRateLimiter`. Checked: it is a pure addition that does not touch `rateLimit()`, `RateLimitOptions`, the charge-before-handler behavior, or the `onLimited` doc comment at `:21-31`. **Findings 1 and 2 stand unchanged**, and the new helper reinforces finding 2's rule — it declares its own `onLimited` matching its own response shape rather than borrowing another endpoint's.

No other file cited by this change differs between the merge-base and current `main`; GitHub reports `mergeable_state: clean`, so the drift is additive and non-conflicting.

**Fix.** Rebase onto current `main`, then re-point the two `App.tsx:14-16` citations at `16-18` and note the two additional routes the guard must cover in the Impact section and in task 11.x's QA sweep.

## Rule check

| Rule | Where | Complies |
|---|---|---|
| OpenSpec `MODIFIED` headers match baseline verbatim | `specs/authentication/spec.md` ×3 | Yes — "State-changing requests require a CSRF token", "Session refresh", "Authentication attempts are rate limited" all match `openspec/specs/authentication/spec.md` |
| `MODIFIED` requirements reproduce every baseline scenario | same | Yes — 7→8, 4→5, 4→5 scenarios; none dropped |
| New capability has no baseline to modify | `specs/admin-session/` | Yes — no `openspec/specs/admin-session` exists; uses `## Purpose` + `## ADDED Requirements`, matching the archived `add-home-curation` precedent |
| Change dir carries `.openspec.yaml` | `.openspec.yaml` | Yes — matches all four archived changes |
| Per-endpoint `onLimited`, no borrowed default | `rateLimit.ts:21-31` | **No** — finding 2 |
| Fail-closed CSRF applies uniformly, no per-route carve-out | `specs/authentication` | Yes — the GET-based recovery endpoint needs no exemption, and both exemption alternatives are considered and rejected in `design.md:65-66` |
| Authorization declared on every route (boot audit) | `specs/authorization`, `authorize.ts:289` | Yes — task 2.1 declares `requirePublic()` |
| Permission checks never branch on role name | `specs/authorization` | Yes — Owner is reported as status, never used for enforcement; enforcement stays permission-keyed |
| Enforcement never moves to the client | `CLAUDE.md`, `specs/authorization` | Yes — "Permission-aware rendering is cosmetic, never authoritative" plus the additive-report-only requirement |
| Follow the app's actual frontend pattern | `docs/ARCHITECTURE.md` §8.2 | Yes, deliberately — the change documents that §8.2's TanStack Query / react-hook-form are aspirational and unused, and reuses `apiFetch` / `useAsyncAction` instead |
| Typed `AppError` subclasses, formatted once | `CLAUDE.md` | Yes — the new endpoint adds no new error shape |
| No schema change without migration | `CLAUDE.md` | N/A — no schema change |

## Next steps

1. Fix findings 1–3 before implementation starts. All three are edits to `design.md`, `tasks.md`, and the two spec deltas; none reopens the architecture.
2. Findings 4–5 are scenario/wording additions worth folding into the same pass.
3. Rebase onto current `main` and apply finding 7 — the drift is additive and conflict-free, but it changes two citations and adds two routes to guard.
4. Re-run `/review-pr` after the spec edits, then start on the tasks — the Build Order in `design.md:113-118` is sound and the backend-first sequencing is correct.

*Local review only — nothing was committed, pushed, or posted to GitHub.*
