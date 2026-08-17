# Review report

**Verdict:** Rejected with changes

## Reviewed at
| Range | Files | +/- | Date |
|---|---|---|---|
| `origin/main...origin/delete-comment-mute-ban-reader` (PR #15, `add-community-moderation`) | 10 | +1020 / -3 | 2026-08-17 |

## Summary

Spec artifacts for a moderation queue, a reader report intake, and a narrowed ban, plus a factual
correction to `docs/ARCHITECTURE.md` §8.1/§8.2. The doc correction is verified accurate — neither
`@tanstack/*` nor `react-hook-form` appears in any `package.json` in the repo, and
`apps/web/components/article/useArticleEngagement.ts` and `apps/admin/src/hooks/useAsyncAction.ts`
both exist as described. Artifact structure follows repo convention throughout (`.openspec.yaml`,
`README.md`, `Purpose` + `ADDED` on the new capability, `MODIFIED` blocks quoting requirement names
that all exist verbatim in their live specs, `RENAMED` target confirmed absent). Decision 4's keyset
SQL is correct, Decision 3's polymorphic-target trade-off is stated honestly, and the reader
`status` enum is `active | banned` only — so moving `status !== 'active'` into the `createsContent`
branch really does only affect banned readers, with no deactivated-account collateral.

The verdict is driven by one Critical: Decision 7's central promise — *a banned reader's existing
session keeps working* — is contradicted by the live `authentication` capability and by shipped code
in `auth.service.ts`, and this change proposes no delta and no task for either. Four Majors follow:
the reader-facing half of the report intake has no `apps/web` work at all, the queue's primary read
has no supporting index, ban's rejection semantics at a content endpoint are unnamed, and the
reporter's free-text `note` is unspecified on both length and rendering.

Standards discovered and used: `CLAUDE.md`, `docs/ARCHITECTURE.md`, `openspec/config.yaml`, the live
specs under `openspec/specs/`, and the eleven archived changes under `openspec/changes/archive/`.
No `openspec/AGENTS.md` exists in the repo despite `CLAUDE.md` referring to it.

## Findings

| # | Severity | Aspect(s) | File:line | Title |
|---|---|---|---|---|
| 1 | Critical | correctness, conventions | `specs/authorization/spec.md:18` | "A banned reader's existing session keeps working" contradicts the `authentication` capability and shipped refresh code; no delta, no task |
| 2 | Major | correctness | `tasks.md` (§4) | The reader-facing report intake has no `apps/web` work — the endpoint ships with no way for a reader to call it |
| 3 | Major | performance | `tasks.md:34` | The queue's global newest-first keyset scan has no supporting index; `comments` is indexed only on `(article_id, created_at)` |
| 4 | Major | correctness, conventions | `specs/community-moderation/spec.md:175` | Ban's rejection status/error code at a content endpoint is unnamed, and no task updates the web copy that special-cases `reader_muted` |
| 5 | Major | security | `tasks.md:55` | Reporter `note` is unbounded reader-supplied text, and the plain-text rendering rule covers only the comment body |
| 6 | Minor | conventions | `design.md:264` | Risks section says the `ARCHITECTURE.md` correction is out of scope — this PR makes it |
| 7 | Minor | conventions | `specs/community-moderation/spec.md` | The report rate limit (20/hour) has no requirement, though `article-engagement` specs its own limits |
| 8 | Minor | correctness | `specs/community-moderation/spec.md:214` | The unknown-target requirement omits filing a report, which tasks 3.3/3.4 require to 404 |
| 9 | Minor | correctness | `specs/community-moderation/spec.md:113` | Open-report count is required only on the `reported` filter; tasks put it on every queue row |
| 10 | Minor | performance | `tasks.md:75` | The reader list's per-reader comment count has no index on `comments.reader_id` |
| 11 | Minor | conventions | `tasks.md:98` | The dismiss endpoint's shape is left unresolved in tasks and is absent from the proposal's endpoint list |
| 12 | Nit | hygiene | `openspec/specs/reader-session/spec.md:161` | "a reader account that is no longer active" becomes a stale rejection cause |
| 13 | Nit | conventions | `proposal.md:133` | Spec artifacts narrate their own revision history; no precedent in the archive |

## Details

### 1. Critical — "A banned reader's existing session keeps working" contradicts `authentication`

`specs/authorization/spec.md:18` and `specs/community-moderation/spec.md:178` both assert that a
banned reader retains *"continued use of any existing session"* and that their credentials are
*"accepted exactly as before the ban."* `design.md:184` states it plainly: *"A banned reader still
signs in, still appears signed-in in the masthead, still likes, still reports."*

The live `authentication` capability says the opposite, in two separate requirements:

- `openspec/specs/authentication/spec.md:119` — *"Wherever an authenticated identity is relied upon
  to grant access, the system SHALL reject a caller whose referenced session has been revoked **or
  whose underlying account is no longer active**, without waiting for the access credential's own
  expiry."*
- `openspec/specs/authentication/spec.md:217` — *"Refresh … SHALL confirm the referenced account
  still exists and is active"*, with the scenario at line 228: *"**WHEN** a valid, unrevoked refresh
  credential is presented for an account that has since been disabled or **banned** — **THEN**
  refresh is refused and **the session is revoked**."*

The code implements exactly that. `apps/api/src/modules/auth/auth.service.ts:106-110` calls
`repository.isSubjectActive(...)`, which for a reader is `row?.status === 'active'`
(`session.repository.ts:136-141`), and on false **revokes the session row** and throws
`account_inactive`. With `ACCESS_TOKEN_TTL_SECONDS = 15 * 60` (`apps/api/src/lib/tokens.ts:7`), a
banned reader keeps read/like/report access for at most 15 minutes, then their session is destroyed
and they are signed out — the opposite of the scenario at `specs/authorization/spec.md:20-22`.

`tasks.md` §0 touches only `authorize.ts`. Nothing in this change proposes a delta to
`authentication`, and nothing plans to touch `auth.service.ts` or `isSubjectActive`. Archiving this
change as written would put two live specs in `openspec/specs/` in direct contradiction, and
implementing `tasks.md` to the letter would produce behaviour that fails the new authorization
scenarios.

Note also that `tasks.md:166` asks the manual verification to *"ban a reader and confirm their
session keeps working"* — that check would fail today for the same reason.

**Fix — pick one and make it explicit:**

- **(a) Commit to the narrowing.** Add `specs/authentication/spec.md` to the change with a MODIFIED
  delta on both *"Revoked sessions are rejected without waiting for expiry"* and *"Session refresh"*,
  splitting the reader case from the staff case: a disabled **staff** account is still refused and
  revoked at refresh; a banned **reader** is not, because ban no longer means "no session." Add a
  task under §0 to change `isSubjectActive` (or its caller) so it does not treat `banned` readers as
  inactive, and a matching `auth.service.test.ts` case. This is the option consistent with
  Decision 7.
- **(b) Keep `authentication` as-is** and narrow the claim: ban blocks comment authoring *and* ends
  the session at the next refresh. Then `specs/authorization/spec.md:18-22` and
  `specs/community-moderation/spec.md:178` must be rewritten, and `design.md`'s "still signs in,
  still likes, still reports" consequence bullet withdrawn — which also removes the stated
  justification for "a sanctioned reader may still report" surviving a ban in practice.

Either way, `design.md` should record that `authentication` was the constraint, since the whole
decision turns on it.

### 2. Major — no `apps/web` work for filing a report

`proposal.md` justifies the report system as the intake that keeps a moderator from *"reading every
row of the newest-first queue"*, and the change adds `POST /comments/:id/report`, the
`comment_reports` table, the `reported` filter, and the dismiss action. But `tasks.md` §4 is titled
"Admin" and contains only admin pages, admin API client, sidebar, and router entries. There is no
task anywhere in §0–§5 that touches `apps/web` — no report control on `CommentSection.tsx`, no
report dialog, no reason picker, no `apps/web/lib` call. `proposal.md`'s **Impact** section lists
DB, Middleware, Contracts, API, and Admin, and no Web bullet.

As specified, the change ships a reader-facing endpoint that no reader can reach, and the queue's
`reported` filter is permanently empty. The `web-public-site` / `article-engagement` capabilities
also gain no requirement for a report affordance, so nothing in the spec says the UI must exist.

**Fix:** add an `apps/web` task section (report control in `CommentSection.tsx`, reason picker with
the four enum values, optional note field, duplicate-report and rate-limit error copy alongside the
existing `reader_muted` message at `CommentSection.tsx:21`), add a matching Web bullet to
`proposal.md`'s Impact, and add a requirement to `community-moderation` (or `article-engagement`)
that a reader viewing a comment can reach the report action. If the web UI is genuinely meant to be
a follow-up, say so in Non-goals and explain what the `reported` filter is for in the meantime.

### 3. Major — the queue's primary read has no supporting index

Decision 4 (`design.md:114`) commits the queue to
`where (created_at, id) < (:cursorCreatedAt, :cursorId) order by created_at desc, id desc` over
`app.comments` globally — every comment, every article. The only index on that table is
`comments_article_created_at_idx` on `(article_id, created_at)`
(`packages/db/src/schema/engagement.ts:70`), which cannot serve a global `created_at desc, id desc`
ordering because it leads with `article_id`.

`tasks.md:34` (migration 0006) is explicitly *"additive only"* and adds indexes on the two **new**
tables only. So the moderation queue — polled every 30 seconds per `tasks.md:141` — falls back to a
sequential scan plus sort of the whole comments table on every poll, and the keyset cursor's row
comparison cannot be pushed into an index seek. That defeats the mechanical benefit Decision 4 is
arguing for; keyset paging without an index matching the sort order is offset paging with extra
steps, correctness gain aside.

**Fix:** add to task 1.1/1.4 an index on `comments (created_at desc, id desc)` (and consider a
partial or covering variant for the `status` filter), and note in Decision 4 that the keyset scan
depends on it. `tasks.md:34`'s "no existing table is altered" claim should be revised to "no column
is added to an existing table" — adding an index is still additive and does not conflict with the
"no new columns" stance.

### 4. Major — ban's rejection semantics at a content endpoint are unnamed

Mute has a defined rejection today: `AppError('Reader is muted', 403, 'reader_muted')`
(`apps/api/src/middleware/authorize.ts:122`), and `apps/web` renders a specific message for that
code — `CommentSection.tsx:21`: `if (error.code === 'reader_muted') return 'Akunmu sedang
dibisukan…'`. There is also a test pinned to it (`EngagementBar.test.tsx:286`).

Ban currently rides the `401 unauthenticated` branch at `authorize.ts:117`. Once it moves into the
`createsContent` branch it needs its own status and code — presumably `403 reader_banned` — but
neither `specs/community-moderation/spec.md:175`, nor `specs/authorization/spec.md:3`, nor
`design.md` Decision 7, nor `tasks.md` 0.1 names one. Tasks 0.1–0.3 change the guard and its tests
without specifying what the guard now throws.

Without it, a banned reader submitting a comment gets whatever `CommentSection.tsx`'s fallback
renders, and `design.md:186`'s own instruction that the UI copy should read as "indefinite comment
suspension" has nothing to key on.

**Fix:** name the code in task 0.1 (`403`, `reader_banned`), add a scenario under *"A reader can be
banned"* covering the rejection being distinguishable from a mute, and add a task for the
`CommentSection.tsx` error-copy branch (which belongs with finding 2's `apps/web` section).

### 5. Major — the reporter's `note` is unspecified on both length and rendering

`comment_reports.note` is reader-supplied free text (`tasks.md:28`, `tasks.md:55`,
`proposal.md:107`) that is stored and then displayed to staff in the moderation queue. Two gaps:

- **No length bound.** `commentReportRequestSchema` is specified as `{ reason, note? }` with
  `.strict()` and nothing else, while `article-engagement` requires a comment body to be *"bounded
  in length"* and `comments.body` is enforced accordingly. An unbounded `note`, at 20 reports/hour
  per reader, is a cheap write-amplification and storage-abuse path with no ceiling.
- **No plain-text rendering rule.** `specs/community-moderation/spec.md:256` requires only that *"a
  comment's body"* render as literal text in the queue, and `tasks.md:138` likewise says "the
  comment body rendered as **plain text**". The reporter's note is the same class of untrusted
  reader input displayed on the same admin screen, and no requirement or task covers it.

**Fix:** bound `note` in `commentReportRequestSchema` (mirroring the comment-body maximum) with a
`moderation.test.ts` case, and widen the requirement at `specs/community-moderation/spec.md:256` and
task 4.2 to cover every reader-supplied string on the queue — comment body *and* report note.

### 6. Minor — `design.md` Risks contradicts the diff

`design.md:264-273` records the `ARCHITECTURE.md` §8.2 drift and concludes: *"The documentation
should be corrected separately to describe what the codebase actually does; that correction is out
of scope for this change."* This PR corrects §8.1 and §8.2 in `docs/ARCHITECTURE.md`. The PR
description says so; `design.md` still tells a reader the doc is uncorrected. `design.md:17-19` has
the same staleness — it describes `PartnersPage.tsx`/`Sidebar.tsx` as *"used in place of what
`docs/ARCHITECTURE.md` §8.2 describes"*, which is no longer a contrast now that §8.2 describes them.

**Fix:** rewrite the Risks bullet to record what was actually done — the drift was found while
planning, corrected in this change, and the correction is why the doc and the tasks now agree — and
drop the "in place of" framing at line 17.

### 7. Minor — the report rate limit has no requirement

`design.md:222` and `tasks.md:108` specify 20 reports/hour keyed on reporter id in its own `name`
namespace, extending `ARCHITECTURE.md` §9.3. No requirement in `specs/community-moderation/spec.md`
covers it. `article-engagement` sets the precedent that this belongs in the spec, not only in
design: *"Engagement writes are rate limited per caller"*
(`openspec/specs/article-engagement/spec.md:165`), including a scenario that separate budgets do not
share a bucket.

**Fix:** add a requirement — reports are rate limited per reader identity in a budget independent of
the comment and like budgets — with a scenario mirroring *"Exhausting one budget does not exhaust
another"*.

### 8. Minor — the unknown-target requirement omits filing a report

`specs/community-moderation/spec.md:214` enumerates *"Removing, restoring, dismissing a comment's
reports, muting, unmuting, banning, or unbanning"* and its two scenarios cover only permitted-caller
actions. But `tasks.md:82` requires not-found handling *"including on report and dismiss"*, and
`tasks.md:104` requires `POST /comments/:id/report` to answer 404 for an unknown comment. Filing a
report against a nonexistent comment id therefore has an implementation task and no requirement.

**Fix:** either extend the requirement's enumeration to include filing a report, or add a scenario
under *"A reader can report a comment"* covering an unknown comment id.

### 9. Minor — open-report count is scoped to the `reported` filter only

`specs/community-moderation/spec.md:113` reads *"Each comment returned by **the reported filter**
SHALL report its number of unresolved reports…"*. The plan is broader: `tasks.md:51` puts
`openReportCount` / `reportReasons` on `CommentQueueRow` itself, `tasks.md:71` computes the count per
row in the repository, and `tasks.md:122` tests that they are *"present only on rows with open
reports"* — a per-row condition, not a per-filter one. As written, a comment carrying open reports
viewed under the `all` or `visible` filter is not required to show its count, which is exactly the
case a moderator scanning the chronological feed (Decision 6) would want.

**Fix:** restate as "each comment returned by the queue that carries unresolved reports", and align
the scenario at line 119 with it.

### 10. Minor — no index for the reader list's comment count

`tasks.md:75` specifies the reader list rows carry a comment count *"via a join or subquery"*.
`app.comments` has no index on `reader_id` (`packages/db/src/schema/engagement.ts:54-71`), so that
count aggregates over the full table for every reader page load. Smaller blast radius than finding 3
— the reader list is not polled — but it is the same omission.

**Fix:** add an index on `comments (reader_id)` in task 1.4, or state in `design.md` that the count
is accepted as a full-scan aggregate at current volume.

### 11. Minor — the dismiss endpoint's shape is unresolved and missing from the proposal

`tasks.md:98` reads: *"`PATCH /admin/comments/:id/reports/dismiss` (or fold into the endpoint above
with an action discriminator — confirm the exact shape during implementation)"*. Meanwhile
`proposal.md`'s **What Changes** endpoint list names `GET /admin/comments`,
`PATCH /admin/comments/:id`, `GET /admin/readers`, `PATCH /admin/readers/:id`, and
`POST /comments/:id/report` — the dismiss endpoint appears nowhere, although
`specs/community-moderation/spec.md:126` makes it a required capability and the action carries its
own `moderation_actions` enum value. Every other endpoint in this change has its shape settled
before implementation; this one defers a REST-convention decision (`CLAUDE.md` — "REST conventions")
into the implementation phase.

**Fix:** settle the shape in the proposal (a discrete sub-resource `PATCH` is the closer match to
the rest of the API) and list it alongside the other endpoints.

### 12. Nit — a stale rejection cause in `reader-session`

`openspec/specs/reader-session/spec.md:159-161`: *"When the API rejects a caller's session for any
reason — an expired or revoked session, or **a reader account that is no longer active** — the site
SHALL present the anonymous state…"*. If finding 1 resolves toward option (a), that third cause no
longer occurs for readers and the sentence becomes vestigial. Conditional on finding 1's resolution;
no action needed if option (b) is taken.

### 13. Nit — spec artifacts narrating their own revision history

`proposal.md:133` opens a section headed *"`article-engagement` now requires changes, where the
predecessor argued it wouldn't"*, beginning *"An earlier revision of this proposal argued…"*, and
`design.md:155` refers to *"the earlier revision of this decision"*. No archived change under
`openspec/changes/archive/` does this — artifacts there state the current decision and its
alternatives, leaving the drafting history to git. The reasoning itself is good and worth keeping;
it reads better as "the alternative considered and rejected" than as a changelog entry, and it will
read oddly once archived.

## Rule check

| Rule | Source | Complies |
|---|---|---|
| Reference the approved OpenSpec change in the PR | `CLAUDE.md` — Pull Requests | ✅ `Implements: openspec/changes/add-community-moderation` |
| Change artifacts: `.openspec.yaml`, `README.md`, `proposal.md`, `design.md`, `tasks.md`, `specs/` | archive convention | ✅ all present, matching `2026-08-17-add-article-engagement` |
| New capability delta uses `## Purpose` + `## ADDED Requirements` | archive convention | ✅ |
| Every requirement carries ≥1 scenario; WHEN/THEN pairs match | OpenSpec | ✅ hand-checked across all four delta files |
| `MODIFIED` names match a requirement in the live spec verbatim | OpenSpec | ✅ all four confirmed |
| `RENAMED` FROM present in live spec, TO absent | OpenSpec | ✅ |
| Requirement dropped from a MODIFIED block, not a stray `REMOVED` | OpenSpec | ✅ the session-revocation sentence and its scenario live inside "Reader-only authorization", so the MODIFIED block correctly subsumes them |
| Deltas cover every capability the change alters | OpenSpec | ❌ **finding 1** — `authentication` is altered in substance and has no delta |
| REST conventions, consistent JSON envelope | `CLAUDE.md` — API | ⚠️ **finding 11** — dismiss endpoint shape deferred |
| Typed `AppError` subclasses, formatted once in `errorHandler` | `CLAUDE.md` — API | ⚠️ **finding 4** — ban's error code unnamed |
| UUID PKs, migrations, transactions where appropriate | `CLAUDE.md` — Database | ✅ atomicity requirement + same-transaction tasks throughout |
| RLS enabled with no policies on every table; `GUARDED_TABLES` updated | `ARCHITECTURE.md` §6.3 | ✅ tasks 1.4, 1.5 |
| Rate limits per route, per identity, own `name` namespace | `ARCHITECTURE.md` §9.3 | ⚠️ implemented in tasks, unspecified in the capability (**finding 7**) |
| Every route carries an explicit authorization declaration | `openspec/specs/authorization` | ✅ tasks 3.4, 5.2 |
| Admin pages follow `useState`/`useEffect`/`useAsyncAction` | code precedent (`PartnersPage.tsx`) | ✅ and `ARCHITECTURE.md` §8.2 now says so |
| Before completion: build, lint, tests, no TS errors | `CLAUDE.md` — Testing | ✅ task 5.1 (spec-only PR; nothing to build yet) |

---

_Local review only — no GitHub review was posted and no code was changed._
