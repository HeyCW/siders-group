# Review report

**Verdict:** Approve with changes

## Reviewed at
| Range | Files | +/- | Date |
|---|---|---|---|
| `origin/main...origin/delete-comment-mute-ban-reader` (PR #15, `add-community-moderation`) | 10 | +1020 / -3 | 2026-08-17 |

## Summary

Spec artifacts for a moderation queue, a reader report intake, and a narrowed ban, plus a factual
correction to `docs/ARCHITECTURE.md` §8.1/§8.2. This is a spec-only change — `tasks.md` is entirely
unchecked and no behaviour ships — so findings below are judged as spec and plan defects, not
runtime ones.

Most of it holds up under checking. The doc correction is accurate: neither `@tanstack/*` nor
`react-hook-form` appears in any `package.json` in the repo, and both files the new text names
(`apps/web/components/article/useArticleEngagement.ts`, `apps/admin/src/hooks/useAsyncAction.ts`)
exist as described. Artifact structure matches the archive convention throughout. Every `MODIFIED`
requirement name exists verbatim in its live spec, the `RENAMED` FROM is present and the TO is
absent, and every requirement carries at least one scenario. Decision 4's keyset SQL is correct.
Decision 3's no-FK trade-off is stated honestly. The reader `status` enum is `active | banned` only,
so moving `status !== 'active'` into the `createsContent` branch really does affect banned readers
and nothing else — the change's most load-bearing assumption checks out.

Two Majors. The first is the one worth blocking implementation on: Decision 7's promise that a
banned reader's existing session keeps working is contradicted by two named scenarios in the live
`authentication` capability, and the change adds no delta and no task for either. The second is that
`tasks.md` has no Web section at all, so the reader-facing report intake — the change's own stated
reason for the report system — has nothing that lets a reader file one. The remaining six Minors and
one Nit are spec-coverage and coherence gaps, each a small edit.

Standards used: `CLAUDE.md`, `docs/ARCHITECTURE.md`, `openspec/config.yaml`, the live specs under
`openspec/specs/`, and the eleven archived changes under `openspec/changes/archive/` — in particular
`2026-08-17-add-article-engagement`, this change's direct predecessor, which is the convention
baseline used below. No `openspec/AGENTS.md` exists in the repo despite `CLAUDE.md` referring to it,
and there is no review guide, so severities follow the default scale.

## Findings

| # | Severity | Aspect(s) | File:line | Title |
|---|---|---|---|---|
| 1 | Major | correctness, conventions | `specs/authorization/spec.md:18` | "A banned reader's existing session keeps working" contradicts two named scenarios in the live `authentication` capability; no delta, no task |
| 2 | Major | correctness, conventions | `tasks.md` | No Web task section — the reader-facing report intake has nothing that lets a reader file a report |
| 3 | Minor | conventions | `design.md:264` | Risks section says the `ARCHITECTURE.md` correction is out of scope; this PR makes it |
| 4 | Minor | security, conventions | `tasks.md:55` | Report `note` has no length bound, where the predecessor specified one for the comment body |
| 5 | Minor | conventions | `specs/community-moderation/spec.md` | The report rate limit has no requirement, though `article-engagement` specs its own limits |
| 6 | Minor | correctness | `specs/community-moderation/spec.md:214` | The unknown-target requirement omits filing a report, which tasks 3.3/3.4 require to 404 |
| 7 | Minor | correctness | `specs/community-moderation/spec.md:113` | Open-report count is required only on the `reported` filter; tasks put it on every queue row |
| 8 | Minor | performance | `tasks.md:34` | No index specified for the queue's global sort or the reader list's comment count |
| 9 | Nit | conventions | `proposal.md` | The dismiss endpoint is missing from the proposal's endpoint list |

## Details

### 1. Major — the banned-session rule contradicts the live `authentication` capability

`specs/authorization/spec.md:18-22` adds:

> **Scenario: A banned reader's existing session keeps working**
> **WHEN** a reader is banned while holding an existing session, and they then request a reader-only
> endpoint that does not create content
> **THEN** their existing session credentials are accepted exactly as before the ban

`specs/community-moderation/spec.md:178` says the same ("including continued use of any existing
session"), and `design.md:184` states the intent plainly.

The live `authentication` capability already answers that exact condition, twice, and answers it the
other way:

- `openspec/specs/authentication/spec.md:125-127` — **Scenario: Access credential stops working when
  the account is deactivated.** *"**WHEN** an account is disabled **or banned** and a request is then
  made with an access credential issued before the deactivation — **THEN** the request is rejected."*
- `openspec/specs/authentication/spec.md:227-229` — **Scenario: Refresh for a deactivated account is
  refused.** *"**WHEN** a valid, unrevoked refresh credential is presented for an account that has
  since been disabled **or banned** — **THEN** refresh is refused and the session is revoked."*

Same condition, opposite outcome. These are not general statements being stretched to fit — both
name `banned` explicitly and both are about a pre-ban credential on a banned account, which is
precisely the case the new scenario describes.

The code implements the existing spec: `auth.service.ts:106-110` calls `isSubjectActive`, which for
a reader is `row?.status === 'active'` (`session.repository.ts:136-141`), and on false revokes the
session row and throws `account_inactive`.

`tasks.md` §0 touches only `authorize.ts`, and no delta for `authentication` is included. As written
the change cannot be implemented to satisfy both capabilities, and archiving it would leave two live
specs contradicting each other on a named scenario.

**Fix — pick one and record it:**

- **(a) Commit to the narrowing.** Add `specs/authentication/spec.md` to the change with a MODIFIED
  delta on *"Revoked sessions are rejected without waiting for expiry"* and *"Session refresh"*,
  splitting reader from staff: a disabled **staff** account is still rejected and refused at refresh;
  a banned **reader** is not, because ban no longer means "no session." Add a §0 task for
  `isSubjectActive` (or its caller) plus an `auth.service.test.ts` case. This is the option
  consistent with Decision 7.
- **(b) Keep `authentication` as-is** and narrow the claim to what it can actually deliver: ban
  blocks comment authoring, and the session ends at the next refresh. Then
  `specs/authorization/spec.md:18-22`, `specs/community-moderation/spec.md:178`, and `design.md:184`
  all need rewriting.

Either way `design.md` should name `authentication` as the constraint, since the decision turns on
it. Worth noting the change's own manual check at `tasks.md:166` — *"ban a reader and confirm their
session keeps working"* — would fail today, which is a good sign the gap is real rather than a
reading of the spec.

### 2. Major — no Web task section, so no reader can file a report

`proposal.md` justifies the report system as the intake that saves a moderator from *"reading every
row of the newest-first queue"*, and the PR's own diagram shows `READER → POST /comments/:id/report`.
The change adds the endpoint, the table, the `reported` filter, and the dismiss action.

`tasks.md` has sections 0 (Authorization), 1 (Database), 2 (Contracts), 3 (API), 4 (Admin), 5
(Verification). Nothing touches `apps/web` — no report control on `CommentSection.tsx`, no reason
picker, no `apps/web/lib` call. `proposal.md`'s **Impact** lists DB, Middleware, Contracts, API, and
Admin, with no Web bullet.

This is a deviation from the predecessor rather than a judgment call about scope: the same author's
`add-article-engagement` carried its reader UI in the same change, in two dedicated sections —
`## 5. Web — reader fetch reuse` and `## 6. Web — the engagement island` (`tasks.md:29`, `:35`) —
ahead of `## 7. Admin`. Nothing in this change's long and specific Non-goals list defers the reader
UI, so the omission reads as unintentional.

As specified, the change ships an endpoint no reader can reach and a `reported` filter that stays
permanently empty.

**Fix:** add a Web section (report control in `CommentSection.tsx`, the four-value reason picker,
optional note, and error copy for the duplicate-report and rate-limit cases), add a Web bullet to
`proposal.md`'s Impact, and add a requirement that a reader viewing a comment can reach the report
action. Include the banned-reader message alongside it — `CommentSection.tsx:21` today special-cases
`reader_muted` (*"Akunmu sedang dibisukan…"*), and a banned reader will hit the same composer with no
equivalent copy. If the reader UI is genuinely meant to be a follow-up, put it in Non-goals and say
what the `reported` filter is for until then.

### 3. Minor — `design.md` Risks contradicts what the PR actually does

`design.md:264-273` records the §8.2 drift and concludes: *"The documentation should be corrected
separately… that correction is out of scope for this change."* This PR corrects §8.1 and §8.2.
`design.md:17-19` has the same staleness, describing `PartnersPage.tsx`/`Sidebar.tsx` as used *"in
place of what `docs/ARCHITECTURE.md` §8.2 describes"* — no longer a contrast now that §8.2 describes
them.

The artifact will be archived in this state, so a future reader is told the doc is still wrong.

**Fix:** rewrite the Risks bullet to record what happened — drift found while planning, corrected
here, which is why the doc and the tasks now agree — and drop the "in place of" framing at line 17.

### 4. Minor — the report `note` has no length bound

`comment_reports.note` is reader-supplied free text (`tasks.md:28`, `:55`). Task 2.2 specifies
`commentReportRequestSchema` as `{ reason, note? }` with `.strict()` and no bound, and task 2.3's
test list covers `.strict()` rejection, the enum values, and the mute presets — no over-length case.

The predecessor is explicit where this is silent: `add-article-engagement`'s task 2.1 specifies
`CommentCreateRequest` (*"trimmed, non-blank, max length"*) and task 2.2 tests *"the body's
blank/whitespace/over-length rules"*. At 20 reports/hour per reader, an unbounded note is a cheap
way to write large rows with no ceiling.

Worth being precise about what this is not: the admin queue is React, which escapes text by default,
so this is not an XSS finding. `specs/community-moderation/spec.md:256` requires the comment *body*
to render as literal text; extending that wording to cover the note as well would be tidy, but the
length bound is the part that matters.

**Fix:** bound `note` in `commentReportRequestSchema` mirroring the comment-body maximum, with a
matching case in task 2.3.

### 5. Minor — the report rate limit has no requirement

`design.md:222` and `tasks.md:108` specify 20 reports/hour keyed on reporter id in its own `name`
namespace. No requirement in `specs/community-moderation/spec.md` covers it, though the sibling
capability sets the precedent that this belongs in the spec: *"Engagement writes are rate limited per
caller"* (`openspec/specs/article-engagement/spec.md:165`), including a scenario that one budget's
exhaustion does not affect another — the exact property `rateLimit.ts`'s `name` namespacing exists to
guarantee and that Decision 8 argues for in prose.

**Fix:** add a requirement that reports are rate limited per reader identity in a budget independent
of the comment and like budgets, with a scenario mirroring the existing one.

### 6. Minor — the unknown-target requirement omits filing a report

`specs/community-moderation/spec.md:214` enumerates *"Removing, restoring, dismissing a comment's
reports, muting, unmuting, banning, or unbanning"*, and its two scenarios cover permitted-caller
actions only. But `tasks.md:82` requires not-found handling *"including on report and dismiss"* and
`tasks.md:104` requires `POST /comments/:id/report` to answer 404 for an unknown comment. Reporting a
nonexistent comment has an implementation task and no requirement behind it.

**Fix:** extend the requirement's enumeration to include filing a report, or add an unknown-comment
scenario under *"A reader can report a comment"*.

### 7. Minor — open-report count is scoped to the `reported` filter only

`specs/community-moderation/spec.md:113` reads *"Each comment returned by **the reported filter**
SHALL report its number of unresolved reports…"*. The plan is broader: `tasks.md:51` puts
`openReportCount` / `reportReasons` on `CommentQueueRow` itself, `tasks.md:71` computes them per row
in the repository, and `tasks.md:122` tests they are *"present only on rows with open reports"* — a
per-row condition, not a per-filter one. As written, a reported comment seen under the `all` or
`visible` filter need not show its count, which is the case a moderator doing the proactive review
Decision 6 describes would most want.

**Fix:** restate as "each comment returned by the queue that carries unresolved reports", and align
the scenario at line 119.

### 8. Minor — no index specified for the queue's global sort or the reader comment count

Two read paths in the plan have no supporting index, and migration 0006 (`tasks.md:34`) adds indexes
on the two new tables only:

- The queue orders globally by `(created_at desc, id desc)` across all comments (Decision 4). The
  only index on `app.comments` is `comments_article_created_at_idx` on `(article_id, created_at)`
  (`packages/db/src/schema/engagement.ts:70`), which leads with `article_id` and so cannot serve a
  global newest-first ordering.
- The reader list's per-reader comment count (`tasks.md:75`, *"via a join or subquery"*) has no index
  on `comments.reader_id`.

Scope this honestly: at the volume the change itself assumes — *"a queue two people look at"* — a
scan and sort of the comments table is not a problem today, and the 30-second poll does not change
that at launch scale. It also does **not** undermine Decision 4: that decision argues keyset paging
on correctness grounds (a skipped row is a comment nobody reviews), and that property holds with or
without an index. This is a "specify it while the migration is being written" note, not a defect in
the reasoning.

**Fix:** add an index on `comments (created_at desc, id desc)` — and optionally `(reader_id)` — to
task 1.4, or record in Decision 4 that both reads are accepted as scans at current volume.
`tasks.md:34`'s *"no existing table is altered"* would become "no column is added to an existing
table", which is what the no-new-columns stance actually claims.

### 9. Nit — the dismiss endpoint is missing from the proposal's endpoint list

`proposal.md`'s **What Changes** names `GET /admin/comments`, `PATCH /admin/comments/:id`,
`GET /admin/readers`, `PATCH /admin/readers/:id`, and `POST /comments/:id/report`. The dismiss
endpoint appears nowhere, although `specs/community-moderation/spec.md:126` makes it a required
capability and it carries its own `moderation_actions` enum value. `tasks.md:98` leaving its exact
shape to implementation is fine — the task flags it as a decision rather than hiding it — but the
proposal should still list the endpoint.

## Rule check

| Rule | Source | Complies |
|---|---|---|
| Reference the approved OpenSpec change in the PR | `CLAUDE.md` — Pull Requests | ✅ `Implements: openspec/changes/add-community-moderation` |
| Change artifacts: `.openspec.yaml`, `README.md`, `proposal.md`, `design.md`, `tasks.md`, `specs/` | archive convention | ✅ all present, matching the predecessor |
| New capability delta uses `## Purpose` + `## ADDED Requirements` | archive convention | ✅ |
| Every requirement carries ≥1 scenario; WHEN/THEN pairs match | OpenSpec | ✅ hand-checked across all four delta files |
| `MODIFIED` names match a requirement in the live spec verbatim | OpenSpec | ✅ all four confirmed |
| `RENAMED` FROM present in live spec, TO absent | OpenSpec | ✅ |
| A requirement dropped inside a MODIFIED block, not a stray `REMOVED` | OpenSpec | ✅ the session-revocation sentence and its scenario live inside "Reader-only authorization", so the MODIFIED block correctly subsumes them |
| Deltas cover every capability the change alters | OpenSpec | ❌ **finding 1** — `authentication` is altered in substance with no delta |
| Reader-facing UI ships with the capability that needs it | predecessor `tasks.md` §5–§6 | ❌ **finding 2** |
| Request schemas bound their free-text fields | predecessor `tasks.md` 2.1–2.2 | ❌ **finding 4** |
| Rate limits per route, per identity, own `name` namespace | `ARCHITECTURE.md` §9.3 | ⚠️ planned in tasks, unspecified in the capability (**finding 5**) |
| REST conventions, consistent JSON envelope | `CLAUDE.md` — API | ✅ dismiss endpoint shape open but flagged (**finding 9**) |
| Typed `AppError` subclasses, formatted once in `errorHandler` | `CLAUDE.md` — API | ✅ tasks 3.3, 3.4 |
| UUID PKs, migrations, transactions where appropriate | `CLAUDE.md` — Database | ✅ atomicity requirement plus same-transaction tasks throughout |
| RLS enabled with no policies; `GUARDED_TABLES` updated | `ARCHITECTURE.md` §6.3 | ✅ tasks 1.4, 1.5 |
| Every route carries an explicit authorization declaration | `openspec/specs/authorization` | ✅ tasks 3.4, 5.2 |
| Admin pages follow `useState`/`useEffect`/`useAsyncAction` | code precedent (`PartnersPage.tsx`) | ✅ and §8.2 now documents it |
| Before completion: build, lint, tests, no TS errors | `CLAUDE.md` — Testing | ✅ task 5.1 (spec-only PR; nothing to build yet) |

---

_Local review only — no GitHub review was posted and no code was changed._
