# Review report

**Verdict:** Rejected with changes

## Reviewed at
| Range | Files | +/- | Date |
|---|---|---|---|
| `origin/main...origin/add-login-reader` (PR #12, head `66dae82`) | 5 | +510 / -0 | 2026-08-16 |

## Summary

Spec-only change: the `add-reader-web-sign-in` OpenSpec proposal for reader Google sign-in in
`apps/web`. No implementation code, so this review checks the same two things the PR #9 review did
— whether the change's factual claims about the existing codebase are true, and whether the design
holds up if built exactly as written.

The factual claims are, with one exception, accurate; the load-bearing ones were each re-derived
from source (see "Verified as accurate"). The central design argument — that the anonymous fast
path is a correctness requirement rather than an optimization, because probing unconditionally
would let anonymous traffic behind a shared NAT drain `refreshRateLimiter()`'s 30-per-15-minutes
budget and lock out genuine returning readers — checks out exactly as written, including the
`401 invalid_refresh_token` shape the throttled caller receives.

Three findings rise to **Major**, all resolvable by editing the artifacts before task 1.1 begins.
The provider-placement task would ship a control that cannot read its own context, because
`SiteHeader` sits outside `{children}` in the current layout. The spec delta drops the
single-flight requirement that the mirrored `admin-session` capability states for the same CSRF
re-pairing mechanism, while `tasks.md` implements it — so the archived contract would not require
behavior the code has. And the change makes a spec requirement that directly contradicts
`docs/ARCHITECTURE.md` §8.1 without the doc-amendment task this repo has attached to every
comparable departure. Three Minor findings follow. Nothing here is a security defect.

Standards used: `CLAUDE.md`, `docs/ARCHITECTURE.md`, the eight archived changes in
`openspec/changes/archive/`, and the existing capability specs in `openspec/specs/` — chiefly
`admin-session` (the sibling capability this one mirrors) and `authentication`. There is no
`docs/adr/`, no `CONTRIBUTING.md`, and no `openspec/AGENTS.md` despite `CLAUDE.md` referencing one;
`openspec/config.yaml` is an unfilled template. Conventions findings therefore cite `file:line`
precedent from archived changes rather than a named rule.

## Findings

| # | Severity | Aspect(s) | File:line | Title |
|---|---|---|---|---|
| 1 | Major | correctness | `openspec/changes/add-reader-web-sign-in/tasks.md:27` | Wrapping only `children` leaves both render sites of the control outside the provider |
| 2 | Major | conventions, correctness | `openspec/changes/add-reader-web-sign-in/specs/reader-session/spec.md:92` | Spec omits the single-flight requirement for CSRF re-pairing that `tasks.md` implements and `admin-session` mandates |
| 3 | Major | conventions | `openspec/changes/add-reader-web-sign-in/proposal.md:33` | A spec requirement contradicts `docs/ARCHITECTURE.md` §8.1, with no task to amend it |
| 4 | Minor | correctness | `openspec/changes/add-reader-web-sign-in/design.md:12` | "A mirror of it keyed on 401" is wrong for the CSRF branch, which is a 403 |
| 5 | Minor | correctness | `openspec/changes/add-reader-web-sign-in/design.md:124` | `StickyNav`'s right-hand space is not clear — it holds `NavLinks` |
| 6 | Minor | conventions | `openspec/changes/add-reader-web-sign-in/specs/reader-session/spec.md:20` | The fast path's accepted lockout is argued in `design.md` but absent from the normative spec |

## Details

### 1. Major — Wrapping only `children` leaves both render sites of the control outside the provider

`tasks.md:27` (3.4) says "Wrap `children` in `app/layout.tsx` with the provider", and
`proposal.md:66` states the same in Impact: "Modified: `app/layout.tsx` wraps children in the
provider."

`apps/web/app/layout.tsx:30-32` renders:

```tsx
<body className="min-h-screen bg-paper font-serif text-ink">
  <SiteHeader />
  {children}
  <SiteFooter />
</body>
```

`<SiteHeader />` is a sibling of `{children}`, not a descendant. `SiteHeader` is where
`apps/web/components/layout/SiteHeader.tsx:9` renders `<StickyNav />`, and tasks 5.4 and 5.5
(`tasks.md:40-41`) put `ReaderControl` in *both* of those surfaces. Wrapping only `{children}`
therefore leaves every render site of the session-dependent control outside the provider's
context, and `useReaderSession()` resolves against no provider.

This fails quietly in the direction the change cares about: the component tests in section 6 mount
`ReaderControl` under their own wrapper and pass, the caching checks in section 7 pass, and the
defect surfaces only at manual step 8.2.

**Fix.** State the wrap in terms of the body's contents, not `children`:

```tsx
<body className="min-h-screen bg-paper font-serif text-ink">
  <ReaderSessionProvider>
    <SiteHeader />
    {children}
    <SiteFooter />
  </ReaderSessionProvider>
</body>
```

Amend `tasks.md:27` and `proposal.md:66` to match. This does not weaken the change's caching
argument — `ReaderSessionProvider` is a Client Component boundary, so wrapping Server Component
children in it leaves them server-rendered; the `revalidate` exports on `app/page.tsx:13` and
`app/news/[slug]/page.tsx:12` are untouched either way.

### 2. Major — Spec omits the single-flight requirement for CSRF re-pairing

`spec.md:92`, "A CSRF failure is recovered by re-pairing, not by refreshing", specifies the
branch, the single retry, and the no-chaining rule — but says nothing about concurrency, and has
no scenario for concurrent `csrf_failed` rejections. Contrast the sibling capability at
`openspec/specs/admin-session/spec.md:98`, which states it explicitly:

> Regardless of how many requests discover a `csrf_failed` 403 at approximately the same time, the
> app SHALL have at most one such recovery call in flight at a time […]

and backs it with a "Concurrent CSRF failures share one recovery call" scenario. The reader spec's
own refresh requirement (`spec.md:74`) does carry the equivalent guarantee, so the omission reads
as an oversight rather than a decision.

Meanwhile `tasks.md:6` (1.4) says "Implement **single-flight** `bootstrapCsrfCookie()`", and
`apps/admin/src/lib/api.ts` already ships exactly that mechanism. So the change implements a
behavior its own normative spec does not require. That inversion matters here because the spec
delta is what gets archived into `openspec/specs/reader-session/` and becomes the durable
contract: a later refactor could delete `inFlightBootstrap` and violate nothing.

**Fix.** Add the concurrency sentence and a matching scenario to `spec.md:92`, mirroring
`admin-session`'s wording, and add a test task alongside `tasks.md:14` (2.6) covering concurrent
`csrf_failed` — section 2 currently tests concurrent 401s (2.5) but not concurrent CSRF failures.

Alternatively, if single-flight bootstrap is genuinely unnecessary at one write endpoint, drop
task 1.4's single-flight qualifier and say so in `design.md` — but note that `design.md` does not
currently discuss the bootstrap mechanism at all, whereas the admin change recorded the reasoning
("Bootstrap is single-flight for stampede avoidance, not for the destructive reason refresh is").

### 3. Major — A spec requirement contradicts `docs/ARCHITECTURE.md` §8.1, with no task to amend it

`docs/ARCHITECTURE.md` §8.1 currently states:

> Server Components fetch from the API directly over the internal URL, forwarding the incoming
> cookie header so the server render knows whether the reader is signed in.

This change does the opposite, and elevates the opposite into a normative requirement.
`spec.md:139`, "Public content rendering does not vary by session", requires that "Session
resolution SHALL happen after the route's content is rendered". `proposal.md:33` names the
departure and argues it well — forwarding the cookie header from the root layout would opt the
whole route tree into dynamic rendering and kill ISR on every article — but records it only as a
non-goal of this change. Nothing amends §8.1, and `tasks.md` has no documentation section.

This repo's settled practice is to amend the architecture doc in the same change that departs from
it, as an explicit task:

- `openspec/changes/archive/2026-08-09-add-auth-foundation/tasks.md:129-135` — a seven-task
  section 14 rewriting §§4, 5.1, 5.3, 5.4, 5.5, and 11 after the auth design diverged.
- `openspec/changes/archive/2026-08-11-add-news-management-system/tasks.md:113` — updating §7 to
  record local-filesystem media storage and the deferred R2 pipeline.

The consequence of skipping it is concrete: §8.1 remains the document a future implementer reads,
and following it would reintroduce the exact ISR regression this change exists to avoid.

**Fix.** Add a documentation task updating §8.1 to record that reader session state resolves
client-side, that public routes deliberately do not vary by session, and why — the same shape as
the two precedents above. §8.1's next paragraph ("A single fetch wrapper handles the 401 → refresh
→ retry cycle in one place; never scatter that logic across call sites") is satisfied by this
change and needs no edit; only the cookie-forwarding sentence is now wrong.

### 4. Minor — "A mirror of it keyed on 401" is wrong for the CSRF branch

`design.md:12` says the admin interceptor "is therefore 403-keyed and cannot be reused verbatim —
the reader client is a mirror of it keyed on 401, with two recovery branches instead of three".

The branch count is right — `apps/admin/src/lib/api.ts` branches on `csrf_failed`, `forbidden`,
and `password_change_required`, and readers have no `password_change_required` concept. But the
reader client cannot be keyed on 401 alone. `createCsrfMiddleware` raises
`new AppError('CSRF token missing or invalid', 403, 'csrf_failed')`
(`apps/api/src/lib/csrf.ts:105-118`), so the CSRF branch this change specifies at `spec.md:92` is
still a **403**. `tasks.md:7` (1.5) gets this right — "401 → refresh → retry once; 403
`csrf_failed` → re-pair → retry once" — but `design.md` is the document an implementer reads for
intent, and as written it describes a client that never enters its own CSRF branch.

**Fix.** Reword to something like: "the reader client is a mirror of it, keyed on 401 for the
session branch while the CSRF branch stays 403-keyed as it is in the admin client, with two
recovery branches instead of three."

### 5. Minor — `StickyNav`'s right-hand space is not clear

`design.md:124` says `StickyNav` "already has a `justify-between` row with clear space at the
right", and `tasks.md:40` (5.4) says to render the control "in `StickyNav`'s existing right-hand
space".

`apps/web/components/layout/StickyNav.tsx:26-32` is a two-child `justify-between` row: the
wordmark `<Link>` on the left and `<NavLinks />` on the right. The right-hand slot is occupied.
Adding a third child redistributes all three across the row and moves `NavLinks` to the centre,
silently changing the sticky bar's composition — the same kind of layout fight `design.md:122`
correctly identifies as the reason not to put the control in the masthead.

**Fix.** Say explicitly that the control is grouped with `NavLinks` inside a shared right-hand
wrapper (so the row stays two-child), and correct the "clear space" phrasing in `design.md:124`.

### 6. Minor — The fast path's accepted lockout is argued in `design.md` but absent from the spec

`spec.md:20`, "A reader with no session marker triggers no session request", makes the absence of
the CSRF cookie conclusive. `design.md:95-98` correctly identifies and accepts the consequence: a
reader holding a live `sid_rt` but no `csrf_token` is shown as signed out despite holding a usable
credential, costing "one extra sign-in click rather than an error".

Worth recording as a requirement rather than only as design prose, because the platform has a
mechanism aimed at exactly this state that this change deliberately does not use.
`openspec/specs/authentication/spec.md:93`, "A CSRF cookie can be re-paired with an existing
session", specifies `GET /auth/csrf` to recover "a live `sid_rt` with no `csrf_token`", and
`apps/api/src/modules/auth/auth.routes.ts:135-152` implements it against the refresh credential.
The reader client will hold that credential and decline to use it. That is a defensible choice —
probing `/auth/csrf` unconditionally would reintroduce a per-visitor request and drag the
bootstrap rate limiter into the anonymous path — but as written, a future reader of the archived
capability sees only "absence is conclusive" with no record that the alternative was weighed.

**Fix.** Add a short scenario or a normative sentence to `spec.md:20` stating that a caller
holding a session credential but no CSRF marker is resolved as anonymous and is not re-paired, so
the behavior is specified rather than incidental.

## Verified as accurate

Checked against source; all correct as stated:

- The whole consumed API surface exists as described — `GET /auth/google` and
  `/auth/google/callback` (`google.routes.ts:53,71`), `GET /auth/me` behind `requireReader()`,
  `POST /auth/refresh`, `POST /auth/logout`, and `GET /auth/csrf` (`auth.routes.ts:126-152`).
- `requireReader()` answers `401 unauthenticated` while `requireStaff`/`requirePermission` answer
  `403 forbidden` for the same condition (`apps/api/src/middleware/authorize.ts:110-116`, `195`,
  `224`) — the premise the whole 401-keyed design rests on.
- `refreshRateLimiter()` is 30 per 15 minutes keyed on `clientIp`, and a throttled caller receives
  `401 invalid_refresh_token`, identical to a genuine rejection
  (`auth.routes.ts:19,36,71-78`). The design's NAT-exhaustion argument holds precisely.
- `csrf_token` is `httpOnly: false` (`csrf.ts:66-76`) and is set with
  `maxAge: REFRESH_TOKEN_MAX_AGE_MS` at every call site — sign-in, refresh, and re-pairing
  (`google.routes.ts:112`, `auth.controller.ts:27`, `auth.routes.ts:146`) — which is 30 days
  (`cookies.ts:11`), matching `sid_rt`. It is never issued without a session, so the fast path's
  premise is sound.
- `COOKIE_DOMAIN` is `z.string().optional()` with no default (`apps/api/src/config/env.ts:86`),
  making session cookies host-only exactly as the risk states.
- `resolveRedirectTarget` validates `next` against `APP_ORIGIN` and `ADMIN_ORIGIN` and falls back
  to the default landing page (`apps/api/src/lib/redirect.ts:14-29`).
- `apps/web/lib/api.ts` is public-only by construction and documents itself as such;
  `revalidate = 60` on `app/page.tsx:13` and `app/news/[slug]/page.tsx:12`, `cache: 'no-store'` on
  `app/news/page.tsx:21-22`.
- `ReaderAccountResponse` exists with a nullable `avatarUrl`
  (`packages/contracts/src/session.ts:39-47`), so the null-avatar scenario at `spec.md:113` is a
  real case and task 5.3 is warranted.
- `StickyNav`'s `scrollY > 240` threshold and the masthead's `clamp(…,92px)` serif wordmark are
  both as described (`StickyNav.tsx:16`, `SiteHeader.tsx:16-19`).
- Access credential lifetime is 15 minutes (`cookies.ts:10`), so manual step 8.3 is correct.
- `proposal.md:44` — "Modified Capabilities: None" — holds. `openspec/specs/web-public-site/spec.md`
  has no masthead, header, or session requirement that a session-dependent control would alter.

## Rule check

| Rule / precedent | Complies? |
|---|---|
| Change directory layout — `.openspec.yaml`, `proposal.md`, `design.md`, `tasks.md`, `specs/<capability>/spec.md` | Yes — matches all eight archived changes |
| Spec delta format — `## ADDED Requirements`, `### Requirement:` with SHALL wording, `#### Scenario:` in WHEN/THEN form | Yes |
| `proposal.md` structure — Why / What Changes / Capabilities / Impact, with New and Modified capability subsections | Yes |
| `design.md` structure — Context / Goals-Non-Goals / Decisions / Risks-Trade-offs / Migration Plan | Yes |
| New capability mirrors its sibling's requirement set where the concern is shared (`admin-session`) | **No** — finding 2 |
| `docs/ARCHITECTURE.md` amended in the change that departs from it (precedent: `add-auth-foundation` §14, `add-news-management-system` 12.1) | **No** — finding 3 |
| `CLAUDE.md` — Testing: build, lint, tests, no TS errors before completion | Yes — `tasks.md:68` (9.2) |
| `CLAUDE.md` — TypeScript strict, never `any` | Yes — `tasks.md:68` (9.2) states it explicitly |
| `CLAUDE.md` — Composition over inheritance, no duplicated logic | Yes — the deliberate duplication at `design.md:73-75` is argued rather than incidental |

---
_Generated by [Claude Code](https://claude.ai/code)_
