# Review report — PR #17 `add-contact-us-feature`

**Verdict:** **Approve with changes** — 1 Major, 6 Minor, 5 Nit. No Critical.

One artifact defect should be fixed before merge because it corrupts a permanent spec on archive.
Everything else is small and none of it blocks.

## Reviewed at

| Range | Files | +/− | Head | CI | Date |
|---|---|---|---|---|---|
| `origin/main...origin/add-contact-us-feature` | 30 | +3482 / −40 | `a22063e` | `build` green | 2026-08-18 |

Verified independently: `tsc --noEmit` clean across api/admin/web/contracts/db, `eslint` clean,
full vitest suite green (93 files / 808 tests).

## Summary

The change replaces the Contact page's placeholder behaviour with a real public intake endpoint, a
`contact.manage`-gated admin inbox, and a 30s unread badge. The implementation is strong and closely
argued: module layering follows §4 exactly, every route carries an explicit §5.5 authorisation
declaration, RLS is default-deny per §6.3, the rate limiter gets its own namespace with the §9.3
budget, and the inbox renders untrusted submitter text as React children with no
`dangerouslySetInnerHTML`. **The security pass found nothing at Critical or Major** — authz, RLS,
CSRF, SQL injection, stored XSS, and `X-Forwarded-For` spoofing of the rate-limit key were each
traced end-to-end and are correct.

Measured against the change's own spec and tasks, the code delivers what it promised. The one item
worth blocking on is a delta that names a requirement which doesn't exist in the main spec, so it
cannot sync and would strand a now-false requirement in `web-public-site`.

Housekeeping: the **PR description is stale** — it says "This PR contains only planning artifacts —
no implementation yet", but commit `a22063e` ships the whole feature across 25 code files. Worth
fixing so reviewers know what they're approving.

## Findings

| # | Severity | Aspect(s) | File:line | Title |
|---|---|---|---|---|
| 1 | **Major** | conventions | `openspec/changes/add-contact-us-feature/specs/web-public-site/spec.md:3` | `MODIFIED` names a requirement absent from the main spec |
| 2 | Minor | correctness, security, hygiene | `openspec/changes/add-contact-us-feature/tasks.md:25` | Task 4.4 claims automated tests that don't exist |
| 3 | Minor | correctness, conventions | `apps/web/components/contact/ContactForm.tsx:21` | Client validation omits the server's length caps |
| 4 | Minor | security | `packages/contracts/src/contact.ts:23` | `email` is the only field with no length bound |
| 5 | Minor | correctness, performance | `apps/admin/src/pages/ContactMessagesPage.tsx:50` | Polled load has no cancellation guard |
| 6 | Minor | hygiene, conventions | `apps/api/src/modules/contact/contact.repository.ts:26` | Dead `findById` on the new repository |
| 7 | Minor | conventions | `apps/admin/src/components/AppShell.test.tsx:7` | Shell test now fires an unmocked network poll |
| 8 | Nit | correctness | `openspec/changes/add-contact-us-feature/design.md:32` | `design.md` says "(and paginated)"; the list isn't |
| 9 | Nit | conventions | `openspec/specs/rbac-management/spec.md:10` | Permission catalog enumeration not refreshed |
| 10 | Nit | correctness, conventions | `openspec/changes/add-contact-us-feature/tasks.md:3` | Artifacts say `NEW`/`READ`; code ships `new`/`read` |
| 11 | Nit | conventions | `apps/admin/src/components/Sidebar.tsx:348` | Badge markup repeated three times |
| 12 | Nit | conventions | `apps/admin/src/lib/contactApi.ts:17` | Query string hand-built instead of `URLSearchParams` |

---

## Details

### 1. Major — `MODIFIED` names a requirement absent from the main spec

The `web-public-site` delta writes its `## MODIFIED Requirements` block under a header that does not
exist in the main spec:

- Main spec (`openspec/specs/web-public-site/spec.md:215`):
  `### Requirement: Contact form validates client-side and does not fabricate submission success`
- Delta (`specs/web-public-site/spec.md:3`):
  `### Requirement: Contact form validates client-side and submits to a real endpoint`

This violates the repo's own documented validation rule
(`.claude/skills/openspec-shared/cli-fallback.md:98`):

> `MODIFIED` and `REMOVED` name requirements that exist in the corresponding main spec

and line 99 names the correct mechanism for this exact case:

> `RENAMED` names a requirement absent under its new name and present under its old one

The sync workflow applies `MODIFIED` by finding the requirement by header
(`openspec-sync-specs/SKILL.md:105-110`) and `RENAMED` by "Find the FROM requirement, rename to TO"
(`:115-116`). With no matching header there is nothing to find, so the change cannot sync cleanly —
and the requirement it was meant to replace is now factually false:

> SHALL NOT report a successful submission or silently discard input, **since no backend endpoint
> accepts a contact submission**
>
> #### Scenario: Valid submission is honestly reported as not yet available

The precedent exists: `add-community-moderation` used a `RENAMED` block when it renamed "A muted
reader may still like".

Note the PR body states `openspec validate --strict` passes locally. No CLI is installed in this
environment, so I could not re-run it — but the hand-check rule above is unambiguous, so either the
CLI is more lenient than the documented rule or the check didn't cover this file.

**Fix:** keep the `MODIFIED` block keyed to the existing header and add:

```markdown
## RENAMED Requirements
- FROM: `### Requirement: Contact form validates client-side and does not fabricate submission success`
- TO: `### Requirement: Contact form validates client-side and submits to a real endpoint`
```

**Rule:** `.claude/skills/openspec-shared/cli-fallback.md:98-99`; precedent
`openspec/changes/archive/2026-08-17-add-community-moderation/specs/article-engagement/spec.md:60`.

### 2. Minor — Task 4.4 claims automated tests that don't exist

`tasks.md:25` is `[x]` for *"tests for permission gating (missing permission, no session), the rate
limit on submission, validation rejection, and the toggle behavior"*. Only the toggle and validation
halves ship (`contact.service.test.ts`, `contracts/src/contact.test.ts`). Nothing exercises
`contact.routes.ts`, `requirePermission('contact.manage')`, or `contactRateLimiter()`.

Scoped honestly: **the behaviour is not unverified.** Task 7.3 records these exact cases checked
end-to-end over HTTP against real Postgres — 403 for no-permission, 403 for no session, 404 for
unknown id, 429 past the 3/hour limit. And the house pattern does leave most modules without
route-level tests. What's wrong is narrower: the checkbox claims automation that isn't there, so the
gap is invisible to the next reader, and nothing pins these gates against future regression.

**Fix:** either add `contact.routes.test.ts` in the style of `authRateLimit.test.ts` /
`authorize.test.ts`, or uncheck 4.4 and state the gap the way 7.3 already does honestly. Tasks
7.1/7.2 are also still unchecked, though CI runs both green.

### 3. Minor — Client validation omits the server's length caps

`contactMessageSubmitRequestSchema` caps name/organisation/subject at 200 and message at 5000
(`contact.ts:21-25`). `ContactForm.tsx`'s `validate()` checks only presence and email shape, and no
input carries a `maxLength`. A visitor who pastes a 6000-character message passes client validation,
gets a 400, and the catch at `:72` collapses it into the generic *"Sending failed — try again"* — a
retry that can never succeed, with no field indicated.

The repo has a direct precedent it doesn't follow here: `COMMENT_MAX_LENGTH` is **exported**
(`engagement.ts:7`) and used by `CommentSection.tsx:61,75` for both `maxLength` and a live
`{length}/{max}` counter. The `CONTACT_*_MAX_LENGTH` constants are declared `const`, not `export
const` (`contact.ts:8-11`), so the web app cannot reuse them even if it wanted to.

**Fix:** export the constants and use them in `validate()` and as `maxLength` on the inputs.

### 4. Minor — `email` is the only field with no length bound

`email: z.string().trim().email()` (`contact.ts:23`) has no `.max()`, while every sibling field is
bounded. Zod's email check is a regex with no length cap, so `"a".repeat(90_000) + "@x.co"`
validates. The only ceiling is `express.json()`'s default 100 KB, set globally with no options at
`server.ts:52`. The value lands in an unbounded `text` column and renders into the inbox row header
(`ContactMessagesPage.tsx:137`, a `<span>` with no `truncate`).

**Fix:** `const CONTACT_EMAIL_MAX_LENGTH = 320;` (RFC 5321 maximum) and
`email: z.string().trim().email().max(CONTACT_EMAIL_MAX_LENGTH)`.

### 5. Minor — Polled load has no cancellation guard

`loadMessages` (`ContactMessagesPage.tsx:50-58`) unconditionally `setMessages` on resolve. Switching
tabs quickly (all → new → all) can land the earlier filter's response last, leaving rows that don't
match the selected tab until the next tick; a tick in flight at unmount writes state on a dead
component. Separately, every background tick calls `setLoading(true)`, so "Loading…" reappears every
30 seconds even when nothing changed.

The guard already exists in this same change — `Sidebar.tsx:241-256` uses a `cancelled` flag. It
just wasn't applied here.

**Fix:** mirror the Sidebar's guard, and skip `setLoading(true)` on background ticks.

### 6. Minor — Dead `findById` on the new repository

Declared (`contact.repository.ts:26`) and implemented (`:54`) but called by nothing — `setStatus`
relies on the update returning `null` for an unknown id (`contact.service.ts:37`). Its only consumer
is the test fake. Every other module's `findById` is genuinely used by its service (e.g.
`partner.service.ts:54`).

**Fix:** drop it from the interface, implementation, and test fake.

### 7. Minor — Shell test now fires an unmocked network poll

`Sidebar` now calls `contactApi.unreadCount()` on mount. `AppShell.test.tsx:7` mocks only
`../session/SessionContext.js`, so those tests issue a real `fetch` (swallowed by the `.catch`,
which is why CI stays green) and leave a live interval running. The house pattern is to mock the API
client in the test that renders the component — `SessionContext.test.tsx:7` mocks
`../lib/sessionApi.js` for exactly this reason.

**Fix:** add `vi.mock('../lib/contactApi.js', ...)` to `AppShell.test.tsx`.

### 8. Nit — `design.md` says "(and paginated)"; the list isn't

`design.md:32` justifies the separate count endpoint partly on the grounds that "the inbox list is
fetched **(and paginated)** only when an admin actually opens the page". No pagination ships.

**The code is not at fault here.** Neither `specs/contact-messages/spec.md` nor `tasks.md` requires
pagination, and `contracts/src/contact.ts:64-66` documents the choice explicitly and correctly
("the spec names no pagination requirement, unlike the comment queue"). The parenthetical in
`design.md` is the only artifact that disagrees with the shipped, spec-compliant behaviour.

**Fix:** drop "(and paginated)" from `design.md:32`. If you want belt-and-braces on a table that
only grows (anonymous writes, no deletion per Non-Goals), a hard server-side `.limit(200)` is a
one-line safety net — but it isn't required by anything this change committed to.

### 9. Nit — Permission catalog enumeration not refreshed

`contact.manage` joins `PERMISSION_KEYS` (`permission.ts:13`) and is seeded in migration 0007, but
no `rbac-management` delta ships. `add-community-moderation` did carry one when it added
`moderation.manage`.

Deliberately a Nit, not a defect: the requirement reads "covering **at minimum**: … and community
moderation" (`openspec/specs/rbac-management/spec.md:10`), so omitting `contact.manage` does not
make it false. It's a break in the habit of keeping the enumeration current, nothing more.

**Fix (optional):** add a `MODIFIED` delta extending the enumeration, matching the prior change.

### 10. Nit — Artifacts say `NEW`/`READ`; code ships `new`/`read`

`tasks.md:3`, `design.md`'s read-state paragraph, and `specs/contact-messages/spec.md` (lines 40, 47,
58, 61-66, 73-77) name the states `NEW`/`READ`. The shipped enum is lowercase everywhere
(`schema/contact.ts:10`, `contact.ts:4`, migration 0007). The code is right — every other `app.enum`
is lowercase and existing specs quote enum values verbatim in lowercase
(`community-moderation/spec.md:36`). Worth fixing before archive, since these become permanent
specs.

### 11-12. Nits

- `Sidebar.tsx` — the same badge pill/dot markup and class string appears three times (`:276-282`,
  `:341`, `:346-350`). The file's own convention factors repeated presentational pieces into local
  components (`IconShell`, the `Icon*` set). Extract `UnreadBadge` / `UnreadDot`.
- `contactApi.ts:17` — query string interpolated by hand where the sibling client builds them via a
  `URLSearchParams` helper (`moderationApi.ts:19-26`). Zero risk today (the value is a closed Zod
  enum); purely a shape divergence.

---

## Rule check

| Rule | Complies |
|---|---|
| §4 module-per-feature layering (routes/controller/service/repository/mapper) | ✅ Matches `partners`/`moderation` exactly |
| §4 controllers hold no business `if`; services never import Drizzle; repositories never import Express | ✅ |
| §4 no raw row reaches the client — always through a mapper | ✅ `contact.mapper.ts` |
| §4 errors as typed `AppError`, formatted once in `errorHandler` | ✅ `contact.service.ts:37` |
| §5.5 every route carries an explicit authorisation declaration | ✅ All four routes |
| §5.5 admin routes gated on a named permission, never a role name | ✅ `requirePermission('contact.manage')` |
| §6.3 app schema + RLS enabled default-deny | ✅ Migration 0007:19 |
| §6.4 drizzle schema is source of truth, SQL generated | ✅ |
| §9.2 error contract `{error:{code,message}}` | ✅ |
| §9.3 contact 3/hour, own namespace | ✅ Budget and namespace correct |
| §9.4 sanitisation | n/a — no HTML stored or rendered; inbox renders text children |
| §11 Zod validation on every request body and query string | ⚠️ Finding 4 — `email` unbounded |
| §11 rate limits enforced, not merely mounted | ✅ Enforced; ⚠️ Finding 2 — verified manually, not automated |
| §11 CSRF on state-changing requests | ✅ Enforced for the admin PATCH; correctly bypassed for the credential-less public POST |
| CLAUDE.md — no `any`, strict mode | ✅ |
| CLAUDE.md — no duplicated logic | ⚠️ Findings 3, 11, 12 |
| CLAUDE.md — build, lint, tests, no TS errors before completion | ✅ CI green; ⚠️ tasks 7.1/7.2 left unchecked |
| OpenSpec — `MODIFIED` names an existing requirement | ❌ Finding 1 |

**Pre-existing, not introduced by this PR** (noted, not counted as findings): §9.3 specifies buckets
keyed by "hashed IP" when not signed in, but `clientIp` (`rateLimit.ts:125-127`) returns the address
verbatim — as do all four existing `clientIp`-keyed limiters. This change follows the house pattern.
Worth a separate cleanup across the shared helper, not a change to this PR.

## Suggested order of work

1. Finding 1 — the `RENAMED` block. Artifact-only, and the one item that should land before merge.
2. Findings 2-4 — a checkbox correction and two small validation gaps visitors can actually hit.
3. Findings 5-7 — small code cleanups.
4. Findings 8-12 at leisure; 8-10 are worth doing before archive, since those artifacts become
   permanent specs.
