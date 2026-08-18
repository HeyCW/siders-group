# Review report — PR #17 `add-contact-us-feature`

**Verdict:** **Rejected with changes** — 4 Major, 10 Minor, 3 Nit. No Critical.

Nothing here is unsafe or broken in production. The verdict is driven by four Majors that are
cheap to fix: one implementation gap that contradicts the change's own design record, one false
"done" on a security-relevant test task, and two OpenSpec delta omissions that would corrupt the
permanent specs on archive.

## Reviewed at

| Range | Files | +/− | Head | CI | Date |
|---|---|---|---|---|---|
| `origin/main...origin/add-contact-us-feature` | 30 | +3482 / −40 | `a22063e` | `build` green | 2026-08-18 |

Verified independently during review: `tsc --noEmit` clean across api/admin/web/contracts/db,
`eslint` clean, full vitest suite green (93 files / 808 tests).

## Summary

The change replaces the Contact page's placeholder "sending isn't wired up yet" behaviour with a
real public intake endpoint plus a `contact.manage`-gated admin inbox and a 30s unread badge. The
engineering is genuinely good: module layering follows §4 exactly (controller parses, service holds
rules, repository owns Drizzle, mapper guards the DTO boundary), every route carries an explicit
authorisation declaration per §5.5, RLS is default-deny per §6.3, the rate limiter gets its own
namespace, and the inbox renders untrusted submitter text as React children with no
`dangerouslySetInnerHTML`. **The security review found nothing at Critical or Major** — authz, RLS,
CSRF, SQL injection, stored XSS, and `X-Forwarded-For` spoofing of the rate-limit key were each
traced end-to-end and are correct.

What holds it back is the seam between the change's artifacts and its code. `design.md` promises a
paginated inbox list; the code has no `LIMIT` on a table that anonymous callers can write to and an
admin page re-downloads whole every 30 seconds. `tasks.md` 4.4 is checked off for permission-gating
and rate-limit tests that do not exist, which is exactly the pair §11 calls out as "enforced, not
merely mounted". And two OpenSpec deltas are missing in ways that would leave the archived specs
self-contradictory.

Note also that the **PR description is stale**: it says "This PR contains only planning artifacts
— no implementation yet", but commit `a22063e` ships the entire feature.

## Findings

| # | Severity | Aspect(s) | File:line | Title |
|---|---|---|---|---|
| 1 | **Major** | correctness, conventions, performance, security | `apps/api/src/modules/contact/contact.repository.ts:59` | Inbox list is unbounded, contradicting `design.md` |
| 2 | **Major** | correctness, conventions, security, hygiene | `openspec/changes/add-contact-us-feature/tasks.md:25` | Task 4.4 checked off; gating and rate-limit tests do not exist |
| 3 | **Major** | conventions | `openspec/changes/add-contact-us-feature/proposal.md:22` | New permission with no `rbac-management` delta |
| 4 | **Major** | conventions | `openspec/changes/add-contact-us-feature/specs/web-public-site/spec.md:3` | Requirement renamed with no `RENAMED` block |
| 5 | Minor | performance | `supabase/migrations/0007_wandering_omega_flight.sql:14` | Plain btree on a two-value enum where §6.3 wants a partial index |
| 6 | Minor | correctness, conventions | `apps/web/components/contact/ContactForm.tsx:21` | Client validation omits the server's length caps |
| 7 | Minor | security | `packages/contracts/src/contact.ts:23` | `email` is the only field with no length bound |
| 8 | Minor | correctness, performance | `apps/admin/src/pages/ContactMessagesPage.tsx:50` | Polled load has no cancellation guard; re-enters loading each tick |
| 9 | Minor | hygiene, conventions | `apps/api/src/modules/contact/contact.repository.ts:26` | Dead `findById` on the new repository |
| 10 | Minor | performance | `apps/admin/src/components/Sidebar.tsx:236` | Badge poll is per-instance and never pauses in a hidden tab |
| 11 | Minor | conventions | `apps/admin/src/components/AppShell.test.tsx:7` | Shell test now fires an unmocked network poll |
| 12 | Minor | correctness | `apps/api/src/modules/contact/contact.service.test.ts:75` | Tests assert the fake repository's behaviour, not production code |
| 13 | Minor | correctness, conventions | `openspec/changes/add-contact-us-feature/tasks.md:3` | Artifacts say `NEW`/`READ`; code ships `new`/`read` |
| 14 | Minor | security | `apps/api/src/middleware/rateLimit.ts:223` | Raw IP as the bucket key (inherited, not introduced) |
| 15 | Nit | conventions | `apps/admin/src/components/Sidebar.tsx:348` | Badge markup repeated three times |
| 16 | Nit | conventions | `apps/admin/src/lib/contactApi.ts:17` | Query string hand-built instead of `URLSearchParams` |
| 17 | Nit | process | — | PR description contradicts what the PR contains |

---

## Details

### 1. Major — Inbox list is unbounded, contradicting `design.md`

`contact.repository.ts:59-63` issues `select * from contact_messages order by created_at desc` with
no `limit`, `offset`, or cursor. `ContactMessagesPage.tsx:63` re-requests that whole list every 30
seconds, per open admin tab.

This is not merely a missing optimisation — it contradicts the change's own approved design.
`design.md:32` justifies splitting the unread count into its own endpoint precisely on the grounds
that the list is paginated:

> the badge polls a cheap, pagination-free count, and the inbox list is fetched **(and paginated)**
> only when an admin actually opens the page.

Both adjacent admin queues over publicly-created rows do paginate: the comment queue is keyset
paginated (`moderation.repository.ts:279-302`, cursor over `(created_at, id)`), and the reader queue
is offset paginated with a capped limit (`moderation.ts:147-157`, `MAX_READER_QUEUE_LIMIT = 100`).

The comment at `contracts/src/contact.ts:64-66` cites `readerQueueResponseSchema` as precedent for a
bare unpaginated array — but that schema is a bare array *because* `readerQueueQuerySchema`
paginates it. The precedent argues the opposite of what the comment claims.

The table is fed by an anonymous endpoint and `design.md` Non-Goals rule out deletion, so nothing
ever trims it. Rows carry up to ~5 KB of message text.

**Fix:** add `limit`/`offset` to `contactMessageQuerySchema` mirroring `readerQueueQuerySchema`
(with `DEFAULT_`/`MAX_` constants), thread through `service.list` → `repository.list`, and page the
admin list. Correct the precedent comment at `contact.ts:64`. If unpaginated really is the intended
trade-off, amend `design.md` so the artifact and the code agree — and still add a hard server-side
`.limit(200)` so one request can never return an unbounded row set.

**Rule:** `design.md:32`; precedent `packages/contracts/src/moderation.ts:147`.

### 2. Major — Task 4.4 checked off; gating and rate-limit tests do not exist

`tasks.md:25` is `[x]` for *"tests for permission gating (missing permission, no session), the rate
limit on submission, validation rejection, and the toggle behavior"*.

Only the toggle half is covered. The change adds `contact.service.test.ts` (service against a fake
repository) and `contracts/src/contact.test.ts` (schema validation). Nothing anywhere exercises
`contact.routes.ts`, `requirePermission('contact.manage')`, or `contactRateLimiter()`.

The exposure is concrete. `auditAuthorizationDeclarations` fails boot only on an *undeclared* route,
so swapping `requirePermission('contact.manage')` for `requirePublic()` on any of the three admin
routes — or dropping `contactRateLimiter()` from the public POST — boots cleanly, passes the entire
suite, and silently exposes every submitter's name, email, and message to anonymous callers.
`docs/ARCHITECTURE.md` §11 lists the contact rate limit under "enforced, **not merely mounted**".

The repo has the precedent to do this: `auth.routes.test.ts`, `authRateLimit.test.ts`,
`authorize.test.ts`, `health.routes.test.ts`.

**Fix:** add `contact.routes.test.ts` — anonymous `GET /admin/contact-messages` → 403; staff without
`contact.manage` → 403; 4th `POST /contact-messages` inside the window → 429 `rate_limited` (reset
via `__resetRateLimitStoreForTests`). Or uncheck 4.4 and state the gap explicitly the way 7.3
already does honestly. Tasks 7.1/7.2 are also still unchecked against CLAUDE.md's completion rule,
though CI does run them green.

**Rule:** `tasks.md` 4.4; ARCHITECTURE §11.

### 3. Major — New permission with no `rbac-management` delta

`contact.manage` is added to `PERMISSION_KEYS` (`permission.ts:13`) and seeded in migration 0007,
but the change ships no delta for `rbac-management`, whose "Fixed permission catalog" requirement
enumerates the catalog's areas (`openspec/specs/rbac-management/spec.md:10` — *"...system settings,
and community moderation"*).

The immediately preceding change did exactly this: `add-community-moderation` carried
`specs/rbac-management/spec.md` with a `## MODIFIED Requirements` block restating that requirement
when it introduced `moderation.manage`. Archiving this change as-is leaves the governing spec
describing a catalog that no longer matches the code.

**Fix:** add `openspec/changes/add-contact-us-feature/specs/rbac-management/spec.md` with a
`## MODIFIED Requirements` block restating "Fixed permission catalog" to include contact-message
management, and list `rbac-management` under Modified Capabilities in `proposal.md`.

**Rule:** precedent `openspec/changes/archive/2026-08-17-add-community-moderation/specs/rbac-management/spec.md`.

### 4. Major — Requirement renamed with no `RENAMED` block

The `web-public-site` delta writes its `## MODIFIED Requirements` block under a **new** header:

- Existing (`openspec/specs/web-public-site/spec.md:215`): `### Requirement: Contact form validates client-side and does not fabricate submission success`
- Delta (`specs/web-public-site/spec.md:3`): `### Requirement: Contact form validates client-side and submits to a real endpoint`

Deltas are matched to the main spec by requirement header. With no `## RENAMED Requirements` block,
syncing is likely to *add* a second requirement and leave the original in place — and the original
directly contradicts what this PR ships:

> SHALL NOT report a successful submission or silently discard input, **since no backend endpoint
> accepts a contact submission**
>
> #### Scenario: Valid submission is honestly reported as not yet available

The house convention for a header change is an explicit FROM/TO block, as used by
`add-community-moderation` when it renamed "A muted reader may still like".

**Fix:** keep the MODIFIED block keyed to the existing header and add:

```markdown
## RENAMED Requirements
- FROM: `### Requirement: Contact form validates client-side and does not fabricate submission success`
- TO: `### Requirement: Contact form validates client-side and submits to a real endpoint`
```

**Rule:** precedent `openspec/changes/archive/2026-08-17-add-community-moderation/specs/article-engagement/spec.md:60`.

### 5. Minor — Plain btree on a two-value enum where §6.3 wants a partial index

Migration 0007 creates `contact_messages_status_idx (status)`. A btree over a two-value enum is not
selective enough for the planner to prefer it, so `countUnread()` (`count(*) where status = 'new'`,
`contact.repository.ts:66`) — the query the badge polls every 30s per admin, forever — degrades to a
seq scan as the table grows and most rows settle into `read`.

ARCHITECTURE §6.3 makes exactly this argument (`articles_published_idx ... where status =
'published'` — *"The partial index matters ... indexing only those keeps it small"*), and migration
0006 already follows it with the partial `comment_reports_open_idx ... where resolved_at is null`.

**Fix:** replace the bare status index with
`CREATE INDEX ... ON app.contact_messages USING btree (created_at DESC) WHERE status = 'new';`,
mirrored in `packages/db/src/schema/contact.ts` so drizzle-kit stays the source of truth. That makes
the badge count an index-only scan over just the unread rows and gives the unread filter its sort
order for free.

*Re-ranked from the aspect review's Major to Minor: the write path is capped at 3/hour per address,
so realistic table volume is small. The convention and its precedent are real, but the blast radius
is not Major at this scale.*

**Rule:** ARCHITECTURE §6.3.

### 6. Minor — Client validation omits the server's length caps

`contactMessageSubmitRequestSchema` caps name/organisation/subject at 200 and message at 5000
(`contact.ts:21-25`). `ContactForm.tsx`'s `validate()` checks only presence and email shape, and no
input carries a `maxLength`. A visitor who pastes a 6000-character message passes client validation,
gets a 400, and the catch at `ContactForm.tsx:72` collapses it into the generic *"Sending failed —
try again"* — a retry that can never succeed, with no field indicated.

The repo has the precedent and does not follow it here: `COMMENT_MAX_LENGTH` is **exported**
(`engagement.ts:7`) and used by `CommentSection.tsx:61,75` for both `maxLength` and a live
`{length}/{max}` counter. The `CONTACT_*_MAX_LENGTH` constants are declared `const`, not `export
const` (`contact.ts:8-11`), so the web app cannot reuse them even if it wanted to.

**Fix:** export the constants from `packages/contracts/src/contact.ts` and use them in `validate()`
and as `maxLength` on the inputs, so the offending field is flagged inline before any request.

**Rule:** spec `web-public-site` — *"submission is blocked and the invalid field is indicated"*;
precedent `apps/web/components/article/CommentSection.tsx:61`.

### 7. Minor — `email` is the only field with no length bound

`email: z.string().trim().email()` (`contact.ts:23`) has no `.max()`, while every sibling field is
bounded. Zod's email check is a regex with no length cap, so `"a".repeat(90_000) + "@x.co"`
validates. The only ceiling is `express.json()`'s default 100 KB, set globally with no options at
`server.ts:52` — nothing feature-specific. The value then lands in an unbounded `text` column and is
rendered verbatim into the inbox row header (`ContactMessagesPage.tsx:137`, a `<span>` with no
`truncate`).

**Fix:** `const CONTACT_EMAIL_MAX_LENGTH = 320;` (RFC 5321 local-part + domain maximum) and
`email: z.string().trim().email().max(CONTACT_EMAIL_MAX_LENGTH)`.

**Rule:** ARCHITECTURE §11 — Zod validation on every request body.

### 8. Minor — Polled load has no cancellation guard; re-enters loading each tick

`loadMessages` (`ContactMessagesPage.tsx:50-58`) fires and unconditionally `setMessages` on resolve.
Switching tabs quickly (all → new → all) can land the earlier filter's response last, leaving rows
that don't match the selected tab until the next tick. A tick in flight at unmount writes state on a
dead component. Separately, every background tick calls `setLoading(true)`, so "Loading…" reappears
every 30 seconds even when nothing changed.

The guard already exists in this same change — `Sidebar.tsx:241-256` uses a `cancelled` flag. It
just wasn't applied here.

**Fix:** mirror the Sidebar's `let cancelled = false` guard (or an `AbortController` tied to the
effect cleanup), and pass a flag so background ticks skip `setLoading(true)` — only the initial
load, filter change, and the explicit Refresh button should show the loading state.

### 9. Minor — Dead `findById` on the new repository

`findById` is declared (`contact.repository.ts:26`) and implemented (`:54`) but called by nothing:
`setStatus` relies on the update returning `null` for an unknown id (`contact.service.ts:37`). Its
only consumer is the fake in `contact.service.test.ts:36`. Every other module's `findById` is
genuinely used by its service (e.g. `partner.service.ts:54`). This is dead public surface on a brand
new module's API.

**Fix:** drop it from the interface, the implementation, and the test fake.

**Rule:** CLAUDE.md — small focused functions, no duplicated/dead logic.

### 10. Minor — Badge poll is per-instance and never pauses in a hidden tab

The poll is owned by `Sidebar`, but `AppShell.tsx` renders `Sidebar` twice: the desktop instance at
`:40` inside `<div className="hidden lg:block">` — Tailwind `hidden` is CSS only, so it is mounted
and polling even on a phone where it is never visible — and a second at `:52` for the mobile drawer,
guarded by `{mobileOpen && ...}`. While the drawer is open, two independent intervals hit
`/admin/contact-messages/unread-count`, each also paying the `requirePermission` lookup, and the two
instances can display different counts.

The interval also never pauses: an admin who leaves the panel open in a background tab issues 120
count queries an hour indefinitely. On `/messages` it stacks with the page's own full-list poll,
even though that response already contains every unread row.

**Fix:** hoist the poll into `AppShell` and pass the count into `Sidebar` as a prop, so there is
exactly one poller. Skip the tick when `document.visibilityState !== 'visible'` and refetch once on
`visibilitychange`.

### 11. Minor — Shell test now fires an unmocked network poll

`Sidebar` now calls `contactApi.unreadCount()` on mount. `AppShell.test.tsx:7` mocks only
`../session/SessionContext.js`, so those tests now issue a real `fetch` (swallowed by the `.catch`,
which is why CI stays green) and leave a live interval running. The house pattern is to mock the API
client module in the test that renders the component — `SessionContext.test.tsx:7` mocks
`../lib/sessionApi.js` for exactly this reason.

**Fix:** add `vi.mock('../lib/contactApi.js', ...)` to `AppShell.test.tsx`, with fake timers or an
assertion on the badge.

### 12. Minor — Tests assert the fake repository's behaviour, not production code

`createContactMessageService` is a pure pass-through, so four tests verify only
`createFakeRepository`: "lists messages newest-first" (`:75`) passes because the fake sorts (`:41`),
"filters to only unread" (`:86`) because the fake filters, "counts only unread" (`:97`) because the
fake counts, and `expect(created.status).toBe('new')` (`:69`) because the `row()` helper hard-codes
it. The real `orderBy(desc(...))`, `eq(status, filter)`, `count()`, and the DB `default('new')` are
never exercised — a repository that dropped the ORDER BY would leave this suite green.

**Fix:** retitle these to what they test (delegation) and drop the vacuous status assertion, or add
`contact.repository.test.ts` asserting the generated SQL the way `partner.repository.test.ts`
already does.

### 13. Minor — Artifacts say `NEW`/`READ`; code ships `new`/`read`

`tasks.md:3` and `specs/contact-messages/spec.md` (lines 40, 47, 58, 61-66, 73-77) name the states
`NEW`/`READ`, plus `design.md`'s read-state paragraph. The shipped enum is lowercase everywhere
(`schema/contact.ts:10`, `contact.ts:4`, migration 0007). The code is the side that's right — every
other `app.enum` is lowercase, and existing specs quote enum values verbatim in lowercase
(`community-moderation/spec.md:36` — `visible`/`removed`).

**Fix:** amend the artifacts to lowercase before archive. Do not change the code.

### 14. Minor — Raw IP as the bucket key (inherited, not introduced)

§9.3 specifies buckets "keyed by user ID when signed in, **hashed IP** when not". `clientIp`
(`rateLimit.ts:125-127`) returns the address verbatim, so every submitting visitor's raw IP sits as
a plaintext key in the process-wide `buckets` map for the full hour.

**This is a pre-existing house-wide gap, not something this PR introduces** — all four existing
`clientIp`-keyed limiters do the same. It is listed only because this change inherits it into the
first endpoint whose callers are anonymous members of the public submitting PII. Rate-limit
*correctness* is fine: `TRUST_PROXY_HOPS` is a hop count defaulting to 0 (`env.ts:80`), so
`X-Forwarded-For` cannot spoof the key.

**Fix (optional, out of scope for this PR):** hash inside the shared `clientIp` helper so every
IP-keyed limiter is fixed at once — the key is only compared for equality, so hashing costs nothing.

### 15-16. Nits

- `Sidebar.tsx` — the same badge pill/dot markup and class string appears three times (`:276-282`
  wordmark, `:341` collapsed dot, `:346-350` nav item). The file's own convention is to factor
  repeated presentational pieces into local components (`IconShell` and the `Icon*` set). Extract
  `UnreadBadge` / `UnreadDot`.
- `contactApi.ts:17` — query string interpolated by hand where the sibling client it's modelled on
  builds every query string through a `URLSearchParams` helper (`moderationApi.ts:19-26`). Safe
  today (closed enum), but diverges from the established shape.

### 17. Nit — PR description contradicts what the PR contains

The description states *"This PR contains only planning artifacts (proposal, specs, design, tasks)
— no implementation yet"* and lists five artifact files. Commit `a22063e` ships the full feature
across 25 code files. Update the description before merge so reviewers know what they're approving.

---

## Rule check

| Rule | Complies |
|---|---|
| §4 module-per-feature layering (routes/controller/service/repository/mapper) | ✅ Matches `partners`/`moderation` exactly |
| §4 controllers contain no business `if`; services never import Drizzle; repositories never import Express | ✅ |
| §4 no raw row reaches the client — always through a mapper | ✅ `contact.mapper.ts` |
| §4 errors as typed `AppError`, formatted once in `errorHandler` | ✅ `contact.service.ts:37` |
| §5.5 every route carries an explicit authorisation declaration | ✅ All four routes declared |
| §5.5 admin routes gated on a named permission, never a role name | ✅ `requirePermission('contact.manage')` |
| §6.3 app schema + RLS enabled default-deny | ✅ Migration 0007:19 |
| §6.3 partial index where a query filters a small slice | ❌ Finding 5 |
| §6.4 drizzle schema is source of truth, SQL generated | ✅ |
| §9.2 error contract `{error:{code,message}}` | ✅ |
| §9.3 contact 3/hour, own namespace | ✅ Budget and namespace correct |
| §9.3 hashed IP when not signed in | ⚠️ Finding 14 — pre-existing, inherited |
| §9.4 sanitisation | n/a — no HTML is stored or rendered; inbox renders text children |
| §11 Zod validation on every request body and query string | ⚠️ Finding 7 — `email` unbounded |
| §11 rate limits enforced, not merely mounted | ⚠️ Finding 2 — mounted, but untested |
| §11 CSRF on state-changing requests | ✅ Enforced for the admin PATCH; correctly bypassed for the credential-less public POST |
| CLAUDE.md — no `any`, strict mode | ✅ |
| CLAUDE.md — no duplicated logic | ⚠️ Findings 6, 15, 16 |
| CLAUDE.md — build, lint, tests, no TS errors before completion | ✅ CI green; ⚠️ tasks 7.1/7.2 left unchecked |
| OpenSpec — spec delta for every capability the change touches | ❌ Findings 3, 4 |

## Suggested order of work

1. Findings 3 and 4 — artifact-only, no code, and they're the ones that corrupt the permanent specs
   on archive.
2. Finding 2 — add `contact.routes.test.ts`, or uncheck 4.4 honestly.
3. Finding 1 — pagination, or amend `design.md` plus a hard server-side cap.
4. Findings 5-14 as capacity allows; 6 and 7 are the two visitors actually feel.
