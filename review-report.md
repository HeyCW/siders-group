# Review report

**Verdict:** Approve with changes

> **Revision note.** An earlier version of this report marked findings 1–3 as Major and returned "Rejected with changes." That was overstated. On re-audit against what the PR actually proposes — a spec-only change with no code — none of the findings is a bug or a rule violation with material consequences. They are clarity and completeness gaps in a strong spec. Severities and verdict corrected below; the underlying observations are unchanged and still verified.

## Reviewed at

| Range | Files | +/- | Date |
|---|---|---|---|
| `origin/main...HEAD` | 7 | +558 / -0 | 2026-08-13 |

Commits: `dfb6750` spec(admin-session), `3f9faf8` fix(admin-session).

This is the diff of **PR #8** (`add-admin-login` → `main`): head `3f9faf8`, base `e94d2b0`, 7 files, +558, 2 commits — identical on every axis to the range reviewed here.

## Summary

This change is **spec-only**: all 558 lines are the `openspec/changes/add-admin-login/` artifacts — proposal, design, three spec deltas, tasks. No application code is touched, and all 49 tasks are unchecked. What follows reviews the specification as the deliverable, which is what the PR proposes.

The quality is high. Every `file:line` citation in the proposal and design was checked against the code and **all of them are accurate** — `csrf.ts:61-64`'s options type, `server.ts:48`, `auth.routes.ts:110/84/90/24-26`, `user.routes.ts:17`, `staff.routes.ts:67`, `authorize.ts:10-13/136-161/110-114`, `google.routes.ts:114`, `auth.controller.ts:26`, `App.tsx:14-16`. Both defects it claims to have found are real and correctly diagnosed. The OpenSpec structure is well-formed: all three `MODIFIED` requirement headers match their baselines verbatim and reproduce every baseline scenario before adding new ones, so nothing is silently dropped on sync; `admin-session` is correctly a new capability; `.openspec.yaml` matches archived precedent. The design's alternatives-considered sections are substantive rather than decorative, and the security reasoning around the bootstrap endpoint is careful and mostly complete.

Nothing here blocks merge. The five Minor findings are places where the spec leaves a decision to the implementer that it could make itself, or where its own prose is slightly inconsistent with its own algorithm. Each is a paragraph or a scenario, not a redesign. The repo ships no review guide (`CONTRIBUTING.md`, `docs/reviewing.md`, `docs/code-review.md` all absent), so this review uses general standards plus `CLAUDE.md`, `docs/ARCHITECTURE.md`, and in-repo precedent cited per finding.

## Findings

| # | Severity | Aspect(s) | File:line | Title |
|---|---|---|---|---|
| 1 | Minor | correctness | `specs/admin-session/spec.md:72` | "Feature route" is undefined, so which requests bypass the interceptor is left to the implementer |
| 2 | Minor | security | `design.md:63` | The `<img>` analysis covers token theft but not rate-limit budget exhaustion |
| 3 | Minor | correctness | `specs/authentication/spec.md:86` | What a throttled `GET /auth/csrf` actually returns is left unresolved |
| 4 | Minor | correctness | `specs/admin-session/spec.md:113` | A third 403 code, `password_change_required`, has no branch in the interceptor |
| 5 | Minor | correctness | `specs/authentication/spec.md:93` | The `sid_at` binding branch contradicts the requirement's own "validly exists" sentence |
| 6 | Nit | hygiene | `proposal.md:39` | "Docs: none required" checks only ARCHITECTURE.md §5.3/§5.5, not §8.1's fetch-wrapper description |
| 7 | Nit | hygiene | `proposal.md:3` | `App.tsx:14-16` has drifted to `16-18` on current `main` |

## Details

### 1. "Feature route" is undefined, so interceptor scope is left to the implementer — Minor

The refresh trigger is scoped to *"a request to a feature route"* (`specs/admin-session/spec.md:72`), a term the change never defines, and the only stated exemption is the sign-in submission. Two requests sit right on that boundary and need opposite treatment:

- **The boot probe** is `GET /users/me`, and the scenario at `spec.md:22-24` explicitly requires a 403 on it to attempt a refresh. So the probe must be **inside** the interceptor.
- **The re-probe** in the disambiguation algorithm is *also* `GET /users/me`, and it should be **outside**. The retry-once bound is per *originating request*, and the re-probe is a new originating request rather than a retry, so an implementer who routes it through the wrapped `apiFetch` is relying on the terminal-outcome rule — *"a failed re-probe SHALL be treated as the session being gone"* — rather than on structure to stop the cycle.

That terminal rule does mean a spec-compliant implementation terminates, which is why this is not a correctness defect. But it is the change's central algorithm, and it currently answers "does the probe go through the wrapper?" only by implication. `POST /auth/refresh` and `GET /auth/csrf` are unscoped the same way, and both can answer 403.

**Fix.** Name the scope instead of implying it: the interceptor wraps every request except `POST /auth/refresh`, `GET /auth/csrf`, and the disambiguation re-probe. Add a scenario asserting the re-probe triggers no further refresh or bootstrap whatever it returns, and say in task 5.7 that the probe bypasses the wrapper.

### 2. The `<img>` analysis covers token theft but not budget exhaustion — Minor

`design.md:63` names the `<img>`-triggered cross-origin GET and concludes the attacker gains nothing, because they cannot read the resulting `Set-Cookie`. That conclusion is correct, and `sameSite: 'lax'` makes it stronger than the design claims — no session cookies ride a cross-site subresource request at all, so no token is ever issued.

What the paragraph doesn't reach is that the request still costs something. `rateLimit` charges the bucket **before** the handler runs (`apps/api/src/middleware/rateLimit.ts:88`), and `refreshRateLimiter` — the shape task 2.1 points at — keys on `clientIp` with no `failuresOnly` (`auth.routes.ts:68-75`). So forced GETs that accomplish nothing still consume the recovery budget for that IP.

Scale honestly: at 30 per 15 minutes, and with each locked-out caller needing roughly one bootstrap call (retry-once bounds it), this bites either when a hostile page deliberately loops the request, or when more than ~30 people behind one NAT recover inside the same 15 minutes. Both are plausible rather than certain, and the consequence is a temporary denial of a recovery path, not a privilege gain. Worth a paragraph in a design doc that otherwise reasons carefully about this endpoint's attack surface.

**Fix.** Don't charge the limiter for a request carrying no session credential — by this change's own spec those are no-ops. Where a credential is present, key on it (e.g. `sha256Hex` of `sid_rt`) so one caller cannot spend another's budget, keeping an IP cap as a coarse flood guard. Extend the existing `<img>` paragraph with the reasoning either way.

### 3. What a throttled `GET /auth/csrf` returns is unresolved — Minor

The new scenario says a throttled re-pairing call is *"rejected, and the rejection is indistinguishable from the endpoint's ordinary uniform response"* (`specs/authentication/spec.md:86-88`). The ordinary response is 204 (task 2.5). Those two clauses pull against each other: if the throttled response is also 204 the caller is not observably rejected, and if it is anything else it is distinguishable.

An implementer has to resolve this, and `rateLimit` forces the question by making `onLimited` a required field precisely because *"the spec's indistinguishability rule is per endpoint, so there is no correct default"* (`rateLimit.ts:21-31`). Task 2.1's "mirror `refreshRateLimiter()`'s shape and export pattern" reads, on its own purpose clause, as being about the exported-factory pattern so tests exercise shipped config — not an instruction to reuse `respondWithRefreshFailure` and its 401. So this is a gap the change leaves open, not one it fills wrongly.

The choice has a real consequence worth stating: a silent 204 on throttle leaves the client unable to tell recovery from refusal, so it retries once, fails, and drops the caller on the generic failure path with no indication why.

**Fix.** Say explicitly what a throttled call returns — 204 with no cookie set is consistent with the uniformity requirement — and note the client-side consequence in `design.md`.

### 4. A third 403 code, `password_change_required`, has no branch — Minor

`requireStaff` and `requirePermission` answer **403 `password_change_required`** (`apps/api/src/middleware/authorize.ts:193-194, 225-226`), a code distinct from both `forbidden` and `csrf_failed`. The interceptor branches only on the latter two, so this one falls through to *"a resulting 403 SHALL be treated as authoritative"* and renders as a permission denial, where the caller should be routed to the forced-change screen.

Reachability is narrow, and the change is not wrong to have deprioritized it: `triggerReset` revokes every session for the target (`apps/api/src/modules/staff/staff.service.ts:112`), so the flag never flips under a live session. It is reached only when the app issues a gated request while already in the pending-change state — which the "confines the app to the change screen" requirement prevents, as freshly as the last probe. Worth closing because the change explicitly frames itself as specifying *the* 403-disambiguation algorithm.

**Fix.** Add a third branch: a 403 coded `password_change_required` re-resolves session state and enters the forced password-change screen, attempting neither refresh nor bootstrap. Add a matching scenario.

### 5. The `sid_at` branch contradicts the requirement's "validly exists" sentence — Minor

The `ADDED` requirement asserts the mechanism *"only re-pairs a CSRF token with a session that already validly exists"*, and its no-token scenario covers a revoked or expired **refresh** credential. But binding branch one fires on `req.auth` alone, which `authenticate` populates from a stateless EdDSA check with no database read (`apps/api/src/middleware/authenticate.ts:24-35`). A session revoked in the last 15 minutes still has a live `sid_at`, so a token still gets issued.

Nothing is granted by this — `requireStaff` re-checks the session on the very next request, which is the design's own argument — and `design.md:57` is deliberate about branch one being stateless. It is the delta spec's prose that overclaims relative to its own algorithm, and task 2.7's test list inherits the gap.

**Fix.** Scope the sentence to what the branch checks: the access-credential branch binds to the session named by a cryptographically valid access credential *without a database read*, and issuing a token there is not an assertion that the session is unrevoked. Add a scenario for a revoked session with a live access credential, asserting a token may be issued and that every downstream check still rejects it.

### 6. "Docs: none required" checks only §5.3/§5.5 — Nit

The claim at `proposal.md:39` is accurate for the two sections it names — neither asserts anything about CSRF cookie lifetime. But `docs/ARCHITECTURE.md:524` is the only place the codebase describes a fetch wrapper's recovery cycle, and it describes it as *"401 → refresh → retry"*. That is right for `apps/web`, where `requireReader` answers 401 (`authorize.ts:110-114`), and wrong for the admin wrapper this change introduces, where every staff rejection is a 403 — a distinction `design.md:89` reasons about carefully but never writes back into the docs.

**Fix.** One line in §8.2 noting the admin wrapper's cycle is 403-keyed with code-based branching.

### 7. `App.tsx:14-16` has drifted on current `main` — Nit

`main` has advanced 13 commits since this change's merge-base. PR #7 added `/reels` and `/reels-curation` to `App.tsx`, so `LoginPage` now sits at **`16-18`**, not the `14-16` cited in `proposal.md:3` and `design.md:3`, and the file has 8 routes rather than 6.

This is ordinary churn rather than a defect in the change: line-number citations in a spec go stale by nature, and task 6.2 is written by reference ("routes other than `/login`"), so it already covers whatever routes exist at implementation time. Recorded only so the citations get refreshed on the next rebase.

I also checked the other file PR #7 touched that this review depends on: `rateLimit.ts` gained `publicReadRateLimiter`, a pure addition that leaves `rateLimit()`, `RateLimitOptions`, the charge-before-handler behavior, and the `onLimited` doc comment at `:21-31` untouched. **Findings 2 and 3 are unaffected by it.** GitHub reports `mergeable_state: clean`.

## Rule check

| Rule | Where | Complies |
|---|---|---|
| OpenSpec `MODIFIED` headers match baseline verbatim | `specs/authentication/spec.md` ×3 | Yes — "State-changing requests require a CSRF token", "Session refresh", "Authentication attempts are rate limited" all match `openspec/specs/authentication/spec.md` |
| `MODIFIED` requirements reproduce every baseline scenario | same | Yes — 7→8, 4→5, 4→5 scenarios; none dropped |
| New capability has no baseline to modify | `specs/admin-session/` | Yes — no `openspec/specs/admin-session` exists; uses `## Purpose` + `## ADDED Requirements`, matching the archived `add-home-curation` precedent |
| Change dir carries `.openspec.yaml` | `.openspec.yaml` | Yes — matches all four archived changes |
| Per-endpoint `onLimited`, no borrowed default | `rateLimit.ts:21-31` | Unresolved — the change requires rate limiting but never fixes the throttled response shape (finding 3) |
| Fail-closed CSRF applies uniformly, no per-route carve-out | `specs/authentication` | Yes — the GET-based recovery endpoint needs no exemption, and both exemption alternatives are considered and rejected in `design.md:65-66` |
| Authorization declared on every route (boot audit) | `specs/authorization`, `authorize.ts:289` | Yes — task 2.1 declares `requirePublic()` |
| Permission checks never branch on role name | `specs/authorization` | Yes — Owner is reported as status, never used for enforcement; enforcement stays permission-keyed |
| Enforcement never moves to the client | `CLAUDE.md`, `specs/authorization` | Yes — "Permission-aware rendering is cosmetic, never authoritative" plus the additive-report-only requirement |
| Follow the app's actual frontend pattern | `docs/ARCHITECTURE.md` §8.2 | Yes, deliberately — the change documents that §8.2's TanStack Query / react-hook-form are aspirational and unused, and reuses `apiFetch` / `useAsyncAction` instead |
| Typed `AppError` subclasses, formatted once | `CLAUDE.md` | Yes — the new endpoint adds no new error shape |
| No schema change without migration | `CLAUDE.md` | N/A — no schema change |

## Next steps

1. Findings 1, 3, and 4 are the ones worth folding in before implementation — each removes a decision the implementer would otherwise have to make alone, in the change's central algorithm.
2. Findings 2 and 5 are a paragraph each in `design.md` and the `authentication` delta.
3. Refresh the `App.tsx` citations on the next rebase (finding 7). The drift is additive and conflict-free.
4. The Build Order in `design.md:113-118` is sound — backend-first sequencing is correct, and implementation can start against it once 1/3/4 are settled.

*Local review only — nothing was posted to GitHub.*
