## Context

See `proposal.md` — Why. `add-article-engagement` built and enforced two moderation levers —
`app.comments.status` (`engagement.ts`'s `visibleComments()` predicate, `engagement.repository.ts`)
and `app.readers.status` / `mutedUntil` (`requireReader`, `apps/api/src/middleware/authorize.ts`
lines 100-125) — without building anything that writes to either. This change builds the surface
and the record. For comment removal and for mute, it introduces no new enforcement mechanism: a
removed comment was already invisible and a muted reader was already restricted before this change
existed; what changes is who can cause that state, and that doing so now leaves a trace. Ban is the
one exception: Decision 7 narrows what "restricted" means for a banned reader, which is itself a new
enforcement change layered on top of the surface-and-record scope described above, not merely a new
way to set an already-correct behaviour.

Existing precedent this design follows directly:
- `engagement/` (`apps/api/src/modules/engagement/`) — repository / service / controller / routes /
  mapper split, the shape `moderation/` copies.
- `PartnersPage.tsx` / `Sidebar.tsx` — the actual admin fetch pattern
  (`useState`/`useEffect`/`useAsyncAction`) and the actual sidebar `NavGroup` shape, both used in
  place of what `docs/ARCHITECTURE.md` §8.2 describes.
- `0004_steep_leper_queen.sql` (`add-brand-section`) — the precedent for reusing an existing
  permission (`settings.manage`) instead of adding one, cited below as the road considered and not
  taken here.

## Goals / Non-Goals

**Goals:**
- Give staff an in-product way to exercise the two moderation levers `article-engagement` already
  enforces — narrowed, for ban, to exactly what it should have enforced all along — without adding
  a third.
- Give a moderator an intake for knowing a bad comment exists at all: the reader-facing report
  system this change adds, so the queue is no longer scanned blind.
- Keep a record of every action taken — who, on what, doing what, why (optionally), and when — so a
  wrong call is reviewable and a repeat offender is identifiable.

**Non-Goals:** as listed in `proposal.md` — no bulk actions, no comment editing, no automated
detection, no appeals workflow, no moderation email, no general `audit_log`; reporting scoped to
comments only, no outcome notification to reporters, no reputation or trust weighting of reporters,
no anonymous reporting.

## Decisions

### 1. Remove/restore, never hard delete

`comments.status` is already `visible | removed`, not a row that can vanish. This change's
"remove" action is a `PATCH` that sets `status = 'removed'`; "restore" sets it back. The predecessor's
`design.md` gives the reason the column exists at all: `removed` rather than a hard delete "leaves
the row for whoever needs to see what was said." This change takes that literally — restore is not
a five-second undo toast bolted onto the remove action, it is a first-class filtered view of the
same queue (`status=removed`), reachable at any time, because a wrong call needs to be recoverable
days later, not just in the seconds after it's made.

### 2. One permission, `moderation.manage`, covering both comments and readers

Two alternatives were considered and rejected:

- **Reuse `news.manage`.** Rejected because it would mean anyone who can write and publish an
  article can also police what readers say about it — editorial authorship and reader-speech
  policing are different jobs, and conflating them means a role built for the first silently
  acquires the second.
- **Reuse `settings.manage`.** Rejected because moderation is not site configuration. It is an
  ongoing operational judgment call made against a stream of reader activity, not a static setting
  staff configure once.

`add-brand-section` deliberately reused `settings.manage` for partners rather than adding
`partner.manage` (`0004_steep_leper_queen.sql`'s migration comment, and `design.md` - "Permission:
reuse `settings.manage`"), on the grounds that a partner directory fits "site configuration"
squarely and growing the catalog for it would repeat a pattern `home-curation` had already avoided.
That reasoning does not transfer here: moderation is neither "site configuration" like a partner
directory nor "editorial content" like an article. It is its own axis of control — who may act on
reader behaviour — and no existing catalog entry names that axis. A new key is the honest fit, not
a default reached for want of trying the alternative.

One permission across both comment and reader actions, rather than two (`comment.moderate` and
`reader.moderate`), because they are one job in practice: a staff member reviewing a comment queue
is the same person who decides whether the reader behind a comment should be muted or banned.
Splitting the permission would force every role assignment to grant both together anyway, adding a
distinction with no role in this codebase that would ever want one half without the other.

### 3. A `moderation_actions` log, not `removed_by`/`removed_at` columns on two tables

The alternative — a `removed_by uuid` and `removed_at timestamptz` on `comments`, and
`banned_by`/`banned_at`/`muted_by` on `readers` — was considered and rejected on three grounds:

- **No room for *why*.** A column pair records that an action happened, not the reason given for
  it, and a moderation decision is exactly the kind of judgment call that benefits from a reason
  being attached to it later.
- **No record of an unmute or an unban.** A `banned_at` column has nothing to hold once a reader is
  unbanned — the fact that they were once banned, when, and why, is lost the moment the status flips
  back, unless a second set of columns is added for reversal, which is the log shape with extra
  steps.
- **Only the latest action is ever visible.** A column remembers one moment; "is this reader a
  repeat offender" is the question a moderator actually asks, and a column can't answer it. A log
  with one row per action can.

`app.moderation_actions` is `target_type` (`comment | reader`) plus a bare `target_id uuid` —
**deliberately not a foreign key** to either `comments` or `readers`. The table is polymorphic
across two targets, so a single FK column cannot reference both; and a comment or reader deleted
later (cascading from an article or, hypothetically, a reader-deletion feature that does not exist
today) should not be able to erase the record that it was once moderated. The cost, stated plainly:
`target_id` carries no referential integrity, so an orphaned reference is possible and the
application, not the database, is responsible for treating a moderation-history read against a
since-deleted target gracefully.

Positioning relative to `audit_log`: `docs/ARCHITECTURE.md` §11 lists a general `audit_log` written
on every admin mutation as **outstanding**, deferred to a follow-up (`add-auth-foundation`'s
`design.md` - Non-Goals). `moderation_actions` is not that table brought forward under a different
name — it is scoped to exactly the seven moderation actions this change introduces, with a shape
(`target_type`/`target_id`/`action`/`reason`) suited to that narrow purpose. A general `audit_log`
covering every admin mutation across every module is a different, larger piece of work with its own
design questions (what counts as a mutation worth logging, retention, whether it captures
before/after values); this table answers none of those questions for anything outside moderation,
and building it does not reduce the size of that eventual follow-up.

### 4. Keyset pagination on the queue, deliberately unlike the public comment listing

`GET /articles/:id/comments` paginates by `limit`/`offset` (`commentListQuerySchema`,
`packages/contracts/src/engagement.ts`), and `engagement.repository.ts`'s `listComments` already
orders by `desc(comments.createdAt), desc(comments.id)` — `id` breaking ties so the sort is stable.
The predecessor's `design.md` records the known cost of offset paging under that stable sort: a
comment landing ahead of the page boundary between one page load and the next shifts every following
row down by one, so the next `offset` re-serves the previous page's last row instead of advancing.
On the public listing that is cosmetic — a reader sees one comment twice across a scroll.

The moderation queue takes the same defect and answers it differently, because the consequence is
different: a comment skipped on a moderation queue is a comment nobody ever reviews. The queue
therefore does not accept `offset` at all. It accepts a cursor derived from the last row of the
previous page — `(createdAt, id)`, the same tie-break pair `listComments` already orders on — and a
request for the next page asks for rows strictly after that position (`where (created_at, id) <
(:cursorCreatedAt, :cursorId) order by created_at desc, id desc`). A comment inserted mid-session
lands somewhere relative to the cursor, not at a fixed offset the cursor has already passed, so it
either appears on the caller's next page or doesn't — it never causes an existing row to be
silently dropped from the page boundary. This is the first keyset-paginated endpoint in the
codebase; every other list (`/articles`, `/articles/:id/comments`, the admin article list) still
pages by offset, so this is a deliberate divergence for this one endpoint, not a new house style
adopted everywhere.

### 5. Banning does not retroactively remove the reader's existing comments

Ban and comment removal are two separate levers acting on two separate targets — a reader account
and a comment row — and they stay separate here. Banning a reader flips `readers.status`; it does
not touch a single row in `comments`. The alternative (a ban cascading into "also mark every comment
by this reader as removed") was considered and rejected: a bulk mutation hidden inside what reads
as an account-status change is a surprise no moderator asked for, and it collapses two distinct
decisions — "this reader should not act again" and "this reader's past comments should not be
visible" — into one action that cannot be taken back independently. A staff member who wants both
takes both actions explicitly. Bulk removal of a banned reader's comments is a plausible follow-up,
but it is a new, explicit action, not an implicit effect of this one.

### 6. The global newest-first queue has a ceiling — reporting raises it, it does not remove it

`GET /admin/comments` with no filter is still every comment across every article, newest first.
That remains the right shape for the stated volume — `docs/ARCHITECTURE.md` §8.2 already calls this
"a queue two people look at" in the context of the 30-second poll — and it remains wrong at some
larger traffic level, where a global feed stops being reviewable by two people scanning it. This
change adds exactly the thing the earlier revision of this decision named as the usual answer to
that ceiling: a report/flag system, and with it a `reported` filter. A moderator's default look is
now the `reported` filter, ordered to the comments carrying open reports, rather than the full
chronological feed — that is where most of the load a moderator actually carries now routes
through. The chronological feed is not retired; it is still where proactive review happens and it is
still the only route to a comment nobody happened to report, which is why report volume is never
allowed to *replace* review of that feed, only to prioritise it (Decision 9).

What this decision does not claim: the unfiltered feed's own ceiling is unchanged by any of this. A
report system narrows *where a moderator looks first*; it does nothing to the cost of scanning the
full feed when reports run dry or when a comment nobody reported still needs catching. The ceiling
named here originally is exactly as present as it was before — recorded and deferred, the same way
the predecessor's `design.md` recorded `view_seen`'s unbounded growth as a known limit rather than
building the retention job it implied.

### 7. Ban narrows to "cannot author new comments," not account lockout

Today `requireReader` (`apps/api/src/middleware/authorize.ts:117`) rejects any reader whose
`status !== 'active'` in the guard's always-reject branch, before the `createsContent` check ever
runs. That makes `banned` indistinguishable from "holds no session at all" — it fails every
reader-only endpoint, muted or not, content-creating or not. This change moves that check out of
the always-reject branch and into the `createsContent` branch, alongside the mute check that
already lives there. The result: a reader's ability to author content requires being neither banned
nor currently muted; every other reader-only endpoint — read, like, report, the reader's own-account
endpoint — requires only an authenticated reader identity. Ban and mute become two flavours of the
same "cannot author" sanction, differing only in duration: mute is time-boxed, ban is indefinite.

The consequences are worth stating plainly, not left implicit in a diff:

- **Banning no longer terminates account access.** A banned reader still signs in, still appears
  signed-in in the masthead, still likes, still reports. The only thing a ban stops is new comments.
- **The "deactivating a reader revokes all sessions" requirement goes away.** It existed to make the
  old always-reject ban meaningful for the lifetime of a session, not just the next authentication;
  once ban stops being an always-reject condition, there is nothing left for it to enforce. After
  this change there is no lever that fully locks a reader out of the site. If one is ever needed — a
  compromised account, or like-based harassment that a comment suspension does nothing to stop — it
  is a **third state**, not a repurposing of this one. Collapsing "cannot comment" and "cannot use
  the site at all" back into a single flag is the exact confusion this change removes; a future
  full-lockout lever should not reintroduce it by riding on `banned`.
- **Ban reads as "indefinite comment suspension," not "account termination."** The admin UI's copy
  should say so. A moderator reaching for "ban" expecting to silence a repeat offender's account
  entirely will otherwise be surprised that the reader is still visibly active everywhere else on
  the site — the label should set that expectation rather than let it be discovered.

The alternative — leaving `requireReader`'s always-reject branch as-is and adding a second, narrower
check just for the report endpoint — was rejected. It would special-case one route around a guard
every other route still trusts, which is exactly the kind of per-route authorization drift
`authorize.ts`'s own audit machinery (`auditAuthorizationDeclarations`) exists to catch
structurally, not the kind of thing worth papering over with an exception.

### 8. A report is reader-gated but blocked by no sanction

`POST /comments/:id/report` declares `createsContent: false`. A report is not public speech — it
publishes nothing another reader ever sees — so neither a mute nor a ban restricts filing one, the
same reasoning `article-engagement`'s "a like publishes no reader-authored text" already established
for likes (that requirement is renamed "A sanctioned reader may still like" and extended to cover
both sanctions by this change). The stakes are higher here than they are for likes: a banned reader
is often exactly the person who notices abuse aimed at them, and gating reports on a sanction that a
bad-faith complaint could get someone banned into would hand the report system a lever for the exact
abuse it exists to catch.

Anonymous visitors cannot report. Reader-gating is what makes a report attributable to one account
for the unique-per-comment constraint, and rate-limitable per identity rather than per shared
address — the same reasoning `article-engagement`'s comment and like limiters already key on reader
id rather than IP. This is an accepted cost, not an oversight: a signed-out reader who sees abuse has
no route to flag it in this change.

Rate limiting follows `docs/ARCHITECTURE.md` §9.3's existing per-route, per-identity pattern: 20
reports/hour, keyed on reporter id, in its own `name` namespace. §9.3's list (comments 10/hour,
likes 60/hour, views 60/hour, login 5 per 15 minutes, contact 3/hour) does not yet include reports;
this extends it rather than reusing an existing bucket, for the same collision reason `rateLimit.ts`'s
own `name` field documents — two limiters whose key generators return the same string silently share
a counter and enforce each other's ceilings.

Resolution:

- **Removing a comment resolves its open reports**, in the same transaction as the `comments.status`
  update. An open report against a comment that no longer exists to be reviewed is a queue item
  nobody can act on again, so it closes with the removal that made it moot.
- A moderator can instead **dismiss** reports without removing the comment — judged fine, reports
  resolved, comment stays visible. This is its own action, `comment_reports_dismissed`, added to the
  `moderation_actions` enum alongside the existing six, because "this comment stays up despite being
  reported" is a decision worth its own record, distinct from both removal and silent inaction.
- **Restoring a previously removed comment does not reopen the reports that removal resolved.**
  Restoration says "this comment should not have come down," not "the reports against it were
  wrong" — reopening them would make restoration implicitly re-litigate every report against it,
  which restoring the comment alone does not claim.

### 9. Report volume is a triage signal, never an automatic trigger

Nothing is auto-hidden at any open-report count, and no threshold exists anywhere in this design
for one to be wired in later without a deliberate decision. The open-report count and the reasons
attached to it are read by a moderator deciding what to look at next; they never themselves remove
a comment, mute a reader, or otherwise act.

The reason is brigading: a coordinated group reporting a comment they merely disagree with, rather
than one that violates any actual rule. An automatic action keyed on report count turns that
coordination into a heckler's veto — it removes lawful speech with no human ever in the loop, and it
rewards the readers most willing to organise against a comment over the ones best positioned to
judge it. The unique index on `(comment_id, reporter_id)` caps each reader at one report per
comment, which limits the *volume* a single determined reporter can generate alone, but it does
nothing to prevent *coordination*: twenty distinct readers each filing their one permitted report is
indistinguishable, by count alone, from twenty readers who each independently found the same comment
abusive. Report count cannot tell those two cases apart; only a moderator reading the comment can.
That is why the queue surfaces reports as a signal to look, and nothing in the system is permitted
to treat the number as a verdict.

## Risks / Trade-offs

- **`docs/ARCHITECTURE.md` §8.2 documentation drift.** §8.2 states the admin SPA uses "TanStack
  Query for server state." No admin page does — `PartnersPage.tsx` (and every other admin page
  checked) is `useState`/`useEffect` plus the shared `useAsyncAction` hook
  (`apps/admin/src/hooks/useAsyncAction.ts`), with no TanStack Query dependency anywhere in
  `apps/admin`. This change follows the code, not the doc: the two new admin pages use the same
  `useState`/`useEffect`/`useAsyncAction` pattern as `PartnersPage.tsx`, including for the queue's
  30-second poll (a plain `setInterval`, matching `Sidebar.tsx`'s own Jakarta-clock poll). The
  documentation should be corrected separately to describe what the codebase actually does; that
  correction is out of scope for this change; noting it here is to prevent it from being read as an
  oversight rather than an observed and accepted discrepancy.
- **No FK on `moderation_actions.target_id`** (Decision 3) — accepted cost, stated there.
- **The queue's global ceiling is unchanged by reporting** (Decision 6) — reporting narrows where a
  moderator looks first; it does not raise the volume the unfiltered feed itself can carry. Accepted
  and recorded, not solved.
- **Keyset pagination is new to this codebase** (Decision 4) — one more pagination convention to
  hold in mind alongside offset paging elsewhere; accepted because the two endpoints have different
  correctness requirements, not adopted as a general preference.
- **No lever fully locks a reader out of the site** (Decision 7) — accepted. Narrowing ban to a
  comment-authoring sanction means there is no remaining action that revokes an active reader's
  access entirely; a future need for one — a compromised account, harassment carried out through
  likes rather than comments — is a new, third state, not a re-widening of ban back into what it
  used to do.
- **Reports never auto-act on volume** (Decision 9) — accepted by design, to keep the open-report
  count a triage signal a moderator reads rather than a threshold that acts on its own and becomes a
  heckler's veto for a brigaded comment. The cost is that a comment sitting under many open reports
  stays visible until a moderator actually looks at it — there is no fallback that acts in their
  absence.
- **Anonymous visitors cannot report** (Decision 8) — accepted cost; a signed-out reader who sees
  abuse has no route to flag it in this change.

## Migration Plan

1. Migration 0006, additive only: `app.moderation_actions` (action enum now carrying seven values,
   including `comment_reports_dismissed`), `app.comment_reports` and its `comment_report_reason`
   enum, and the `moderation.manage` permission seeded and granted to Owner. No existing table is
   altered — `comment_reports` is a new table, not a column added to `comments` or `readers`,
   consistent with the "no new columns" stance the original proposal already took for mute and ban.
2. Ship API + admin UI behind the existing deploy pipeline. The staff-facing endpoints are useless
   until staff hold `moderation.manage`, which no role holds automatically except the seeded Owner —
   an Owner grants it to whichever role should carry it, the same rollout shape `rbac-management`
   already supports for any new permission. `POST /comments/:id/report` is reader-gated, not
   permission-gated, so it goes live for every reader the moment the API deploys, independent of
   whether any role yet holds `moderation.manage` — readers being able to flag something and staff
   being able to act on it are different capabilities with different rollout timing, and there is no
   reason to gate the first on the second.
3. Deploy the admin UI; the Community sidebar group is invisible to any account not holding
   `moderation.manage` (`Sidebar.tsx`'s existing `canSee` gate), so rollout is safe for accounts
   that have not yet been granted the permission.

Unlike the rest of this change, narrowing `requireReader`'s ban check (Decision 7) is a behaviour
change in shared middleware that ships regardless of whether any role holds `moderation.manage` —
the moment it deploys, any reader currently in `banned` status regains read, like, and report
access. This is safe today because nothing has ever written `readers.status = 'banned'` outside a
manual SQL update (`add-article-engagement`'s proposal.md — "Moderation is manual for this launch");
a rollout gate is not needed for a state no row is currently in.

Rollback: revert the API and admin changes independently of the migration — the new tables and
permission are additive and referenced by nothing else, so leaving them in place after a rollback of
the surface is not itself a risk. The `authorize.ts` change (Decision 7) rolls back with the rest of
the API code, restoring the always-reject ban check.
