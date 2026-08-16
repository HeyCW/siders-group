# Review report

**Verdict:** Approve with changes

## Reviewed at
| Range | Files | +/- | Date |
|---|---|---|---|
| `origin/main...origin/add-login-reader` (PR #12, head `66dae82`) | 5 | +510 / -0 | 2026-08-16 |

## Summary

Spec-only change: the `add-reader-web-sign-in` OpenSpec proposal for reader Google sign-in in
`apps/web`. No implementation code, so this review checks the same two things the PR #9 review did
— whether the change's factual claims about the existing codebase are true, and whether the design
holds up if built exactly as written.

The claims are accurate. Every load-bearing one was re-derived from source (see "Verified as
accurate"), and none were found wrong. The central design argument — that the anonymous fast path
is a correctness requirement rather than an optimization, because probing unconditionally would let
anonymous traffic behind a shared NAT drain `refreshRateLimiter()`'s 30-per-15-minutes budget and
lock out genuine returning readers — checks out exactly as written, including the
`401 invalid_refresh_token` shape the throttled caller receives. The scoping is disciplined: the
non-goals are real non-goals, the deferred pieces are each named with the condition that would
revive them, and the risks section states the failure modes plainly rather than defensively.

Two Minor findings and one Nit, none of which change the design. Both Minor findings are one-line
edits to `tasks.md`. Nothing here is a correctness, security, or performance defect in the design
itself.

Standards used: `CLAUDE.md`, `docs/ARCHITECTURE.md`, the eight archived changes in
`openspec/changes/archive/`, and the existing capability specs in `openspec/specs/` — chiefly
`admin-session` (the sibling capability this one mirrors) and `authentication`. There is no
`docs/adr/`, no `CONTRIBUTING.md`, and no `openspec/AGENTS.md` despite `CLAUDE.md` referencing one;
`openspec/config.yaml` is an unfilled template. Conventions findings therefore cite `file:line`
precedent from archived changes rather than a named rule.

## Severity calibration

A first pass graded this 3 Major + 3 Minor. Both counts were wrong, and the correction is recorded
here rather than quietly applied — the same disposition the PR #9 review used.

Three findings were withdrawn entirely on re-reading them in the surrounding artifact rather than
against an idealized one:

- **"`design.md:12` says the reader client is keyed on 401, but the CSRF branch is a 403."**
  Withdrawn. The paragraph opens with "**Readers are rejected with 401, staff with 403**" and is
  explicitly contrasting the two clients' *session* branches. Within that frame "keyed on 401" is
  correct shorthand, and `tasks.md:7` (1.5) spells out both branches unambiguously. Reading the
  clause without its own paragraph's frame was the error.
- **"`StickyNav`'s right-hand space is not clear — it holds `NavLinks`."** Withdrawn. The row is
  `max-w-[1120px]` holding a short wordmark and three 11px uppercase links
  (`apps/web/lib/content.tsx:13-17`). There is abundant clear space, which is the design's actual
  claim; whether the control becomes a third flex child or joins a wrapper is a layout detail
  resolved on sight, not a spec question.
- **"The fast path's accepted lockout is absent from the normative spec."** Withdrawn on two
  counts. `design.md` already weighs it explicitly as a "second-order effect worth accepting", and
  `design.md` archives alongside the spec in the same change directory. The spec requirement also
  already states the behavior normatively — a caller with no CSRF marker is resolved anonymous
  with no request issued — which covers a caller holding `sid_rt` without needing a separate
  scenario.

Two findings were downgraded:

- The provider-placement finding was graded Major on the theory that it "fails quietly". It does
  not. It is a one-word imprecision in a task line that surfaces the moment task 5.5 is written,
  and the design intent is unambiguous. **Minor.**
- The `ARCHITECTURE.md` §8.1 finding was graded Major against `add-auth-foundation`'s §14, which
  rewrote sections that had become *wrong*. This change defers a behavior §8.1 *anticipated* but
  that never existed, which is the shape of `add-news-management-system`'s single deferral note,
  not a seven-task rewrite. **Minor.**
- The CSRF single-flight finding was graded Major by holding the reader spec to `admin-session`'s
  requirement set. That imports a concurrency concern this change does not have and whose omission
  the design deliberately argues. **Nit.**

## Findings

| # | Severity | Aspect(s) | File:line | Title |
|---|---|---|---|---|
| 1 | Minor | correctness | `openspec/changes/add-reader-web-sign-in/tasks.md:27` | Wrapping `children` puts the provider below both render sites of the control |
| 2 | Minor | conventions | `openspec/changes/add-reader-web-sign-in/proposal.md:33` | The §8.1 deferral is recorded in the change but not in `docs/ARCHITECTURE.md` |
| 3 | Nit | conventions | `openspec/changes/add-reader-web-sign-in/tasks.md:6` | Task 1.4's single-flight qualifier has no spec requirement or test behind it |

## Details

### 1. Minor — Wrapping `children` puts the provider below both render sites of the control

`tasks.md:27` (3.4) says "Wrap `children` in `app/layout.tsx` with the provider", and
`proposal.md:66` restates it in Impact: "Modified: `app/layout.tsx` wraps children in the
provider."

`apps/web/app/layout.tsx:30-32` renders:

```tsx
<body className="min-h-screen bg-paper font-serif text-ink">
  <SiteHeader />
  {children}
  <SiteFooter />
</body>
```

`<SiteHeader />` is a sibling of `{children}`, not a descendant, and it is where
`apps/web/components/layout/SiteHeader.tsx:9` renders `<StickyNav />`. Tasks 5.4 and 5.5
(`tasks.md:40-41`) put `ReaderControl` in both of those surfaces. Taken literally, 3.4 places the
provider below every render site of the control.

This is an imprecision in the task text, not a flaw in the design — the provider obviously has to
enclose the header, and an implementer hits the missing context the moment they write 5.5. Worth
fixing because it costs one word now and a few minutes of confusion later.

**Fix.** State the wrap in terms of the body's contents rather than the `children` prop:

```tsx
<body className="min-h-screen bg-paper font-serif text-ink">
  <ReaderSessionProvider>
    <SiteHeader />
    {children}
    <SiteFooter />
  </ReaderSessionProvider>
</body>
```

Amend `tasks.md:27` and `proposal.md:66` to match. This does not weaken the caching argument:
`ReaderSessionProvider` is a Client Component boundary, so Server Component children passed
through it stay server-rendered, and the `revalidate` exports on `app/page.tsx:13` and
`app/news/[slug]/page.tsx:12` are untouched. Task 7.2 already checks that.

### 2. Minor — The §8.1 deferral is recorded in the change but not in `docs/ARCHITECTURE.md`

`docs/ARCHITECTURE.md` §8.1 states:

> Server Components fetch from the API directly over the internal URL, forwarding the incoming
> cookie header so the server render knows whether the reader is signed in.

`proposal.md:33` defers this, and does so properly — it cites the section by number, names the
consequence (dynamic rendering across the route tree, killing ISR on every article), and states
the condition that would revive it. `spec.md:139` then makes the deferred posture normative:
session resolution "SHALL happen after the route's content is rendered".

The gap is only that nothing writes the deferral back into §8.1, and `tasks.md` section 9 covers
env-var documentation (`COOKIE_DOMAIN`, `GOOGLE_REDIRECT_URI`) rather than the architecture doc.
The precedent is `openspec/changes/archive/2026-08-11-add-news-management-system/tasks.md:113`,
which is exactly this shape — a single task recording that media storage is local for this change
and the R2 pipeline deferred.

Worth doing because §8.1 is the document a future implementer reads first, and the sentence as
written points at the one approach this change establishes must not be taken from the root layout.
It is Minor rather than Major because §8.1's own route-strategy table already shows `/` as ISR and
`/news/[slug]` as SSG on the same screen, so the tension is visible in place.

**Fix.** Add one task to section 9: amend §8.1 to record that reader session state resolves
client-side, that public routes deliberately do not vary by session, and the condition under which
server-rendered session state is revisited. §8.1's next paragraph — "A single fetch wrapper handles
the 401 → refresh → retry cycle in one place; never scatter that logic across call sites" — is
satisfied by this change and needs no edit.

### 3. Nit — Task 1.4's single-flight qualifier has no spec requirement or test behind it

`tasks.md:6` (1.4) says "Implement **single-flight** `bootstrapCsrfCookie()`". No requirement in
the spec delta asks for it, no test task covers it (section 2 tests concurrent 401s at 2.5 but not
concurrent `csrf_failed`), and `design.md` does not discuss it.

This is deliberate rather than an oversight, and the asymmetry is defensible: `spec.md:74` requires
single-flight refresh because a raced second presentation of a refresh credential is treated as
reuse and revokes the session lineage, whereas a duplicated bootstrap merely re-issues the same
cookie. `design.md` argues that distinction directly. The reader client also has exactly one write
(`POST /auth/logout`), so there is no concurrency to guard — unlike the admin client, where
autosave, publish, and taxonomy CRUD are genuinely concurrent, which is why
`openspec/specs/admin-session/spec.md:98` states the guarantee there.

The only residue is that a task implements a behavior nothing else in the change records, which is
the kind of thing `openspec-verify-change` flags. Resolvable either way in one line: drop the
qualifier from 1.4, or add a sentence to `spec.md:92` and a test to section 2. Not worth blocking
on.

## Verified as accurate

Checked against source; all correct as stated. Listed so a second pass does not have to re-derive
them:

- The whole consumed API surface exists as described — `GET /auth/google` and
  `/auth/google/callback` (`google.routes.ts:53,71`), `GET /auth/me` behind `requireReader()`,
  `POST /auth/refresh`, `POST /auth/logout`, and `GET /auth/csrf` (`auth.routes.ts:126-152`).
- `requireReader()` answers `401 unauthenticated` while `requireStaff`/`requirePermission` answer
  `403 forbidden` for the same condition (`apps/api/src/middleware/authorize.ts:110-116`, `195`,
  `224`) — the premise the 401-keyed session branch rests on.
- `refreshRateLimiter()` is 30 per 15 minutes keyed on `clientIp`, and a throttled caller receives
  `401 invalid_refresh_token`, identical to a genuine rejection (`auth.routes.ts:19,36,71-78`).
  The NAT-exhaustion argument holds precisely, including the claim that the failure is invisible in
  development and looks like a backend bug.
- `csrf_token` is `httpOnly: false` (`csrf.ts:66-76`) and is set with
  `maxAge: REFRESH_TOKEN_MAX_AGE_MS` at every call site — sign-in, refresh, and re-pairing
  (`google.routes.ts:112`, `auth.controller.ts:27`, `auth.routes.ts:146`) — which is 30 days
  (`cookies.ts:11`), matching `sid_rt`. It is never issued without an identifiable session
  (`auth.routes.ts:139-147`), so the fast path's premise that the cookie implies a session is sound.
- Two concurrent refreshes really would revoke the session lineage, per
  `openspec/specs/authentication/spec.md:216` — so single-flight refresh is load-bearing as claimed.
- `COOKIE_DOMAIN` is `z.string().optional()` with no default (`apps/api/src/config/env.ts:86`),
  making session cookies host-only exactly as the risk states, and the localhost-shared-host
  explanation for why local development works is correct.
- `resolveRedirectTarget` validates `next` against `APP_ORIGIN` and `ADMIN_ORIGIN` and falls back
  to the default landing page (`apps/api/src/lib/redirect.ts:14-29`), so the open-redirect claim
  holds.
- `apps/web/lib/api.ts` is public-only by construction and documents itself as such;
  `revalidate = 60` on `app/page.tsx:13` and `app/news/[slug]/page.tsx:12`, `cache: 'no-store'` on
  `app/news/page.tsx:21-22`.
- `ReaderAccountResponse` exists with a nullable `avatarUrl`
  (`packages/contracts/src/session.ts:39-47`), so the null-avatar scenario at `spec.md:113` is a
  real case and task 5.3 is warranted.
- `StickyNav`'s `scrollY > 240` threshold and the masthead's `clamp(…,92px)` serif wordmark are
  both as described (`StickyNav.tsx:16`, `SiteHeader.tsx:16-19`).
- Access credential lifetime is 15 minutes (`cookies.ts:10`), so manual step 8.3 is correct.
- A deactivated reader is genuinely indistinguishable from no session: `requireReader()` returns
  the same `401 unauthenticated` for `status !== 'active'` as for no session at all
  (`authorize.ts:114-116`). The spec is right to specify this rather than leave it accidental.
- `proposal.md:44` — "Modified Capabilities: None" — holds. `openspec/specs/web-public-site/spec.md`
  has no masthead, header, or session requirement that a session-dependent control would alter.

## Rule check

| Rule / precedent | Complies? |
|---|---|
| Change directory layout — `.openspec.yaml`, `proposal.md`, `design.md`, `tasks.md`, `specs/<capability>/spec.md` | Yes — matches all eight archived changes |
| Spec delta format — `## ADDED Requirements`, `### Requirement:` with SHALL wording, `#### Scenario:` in WHEN/THEN form | Yes |
| `proposal.md` structure — Why / What Changes / Capabilities / Impact, with New and Modified capability subsections | Yes |
| `design.md` structure — Context / Goals-Non-Goals / Decisions / Risks-Trade-offs / Migration Plan | Yes |
| Deviations from `docs/ARCHITECTURE.md` recorded in the change (precedent: `add-news-management-system` 12.1) | Partly — recorded in `proposal.md:33`, not written back to §8.1 (finding 2) |
| `CLAUDE.md` — Testing: build, lint, tests, no TS errors before completion | Yes — `tasks.md:68` (9.2) |
| `CLAUDE.md` — TypeScript strict, never `any` | Yes — `tasks.md:68` (9.2) states it explicitly |
| `CLAUDE.md` — Composition over inheritance, no duplicated logic | Yes — the deliberate duplication at `design.md:73-75` is argued, not incidental |
| `CLAUDE.md` — Frontend: hooks over classes, reusable components | Yes — one provider + hook, one shared `ReaderControl` across both surfaces |

---
_Generated by [Claude Code](https://claude.ai/code)_
