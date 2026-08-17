## Context

See `proposal.md` — Why. `add-article-engagement` built and enforced two moderation levers —
`app.comments.status` (`engagement.ts`'s `visibleComments()` predicate, `engagement.repository.ts`)
and `app.readers.status` / `mutedUntil` (`requireReader`, `apps/api/src/middleware/authorize.ts`
lines 100-125) — without building anything that writes to either. This change builds the surface
and the record. It introduces no new enforcement mechanism: a removed comment was already invisible
and a banned or muted reader was already restricted before this change existed; what changes is who
can cause that state, and that doing so now leaves a trace.

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
  enforces, without adding a third.
- Keep a record of every action taken — who, on what, doing what, why (optionally), and when — so a
  wrong call is reviewable and a repeat offender is identifiable.

**Non-Goals:** as listed in `proposal.md` — no report/flag system, no bulk actions, no comment
editing, no automated detection, no appeals workflow, no moderation email, no general `audit_log`.

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
name — it is scoped to exactly the six moderation actions this change introduces, with a shape
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

### 6. The global newest-first queue has a ceiling

`GET /admin/comments` with no filter is every comment across every article, newest first. That is
the right shape for the stated volume — `docs/ARCHITECTURE.md` §8.2 already calls this "a queue two
people look at" in the context of the 30-second poll — and it is wrong at some larger traffic level,
where a global feed stops being reviewable by two people scanning it. No report/flag system exists
in this change to narrow the queue to comments someone has actually flagged, which is the usual
answer to that ceiling. This is recorded here rather than solved, the same way the predecessor's
`design.md` recorded `view_seen`'s unbounded growth as a known limit rather than building the
retention job it implied: naming the ceiling now means it is a known trade-off the next change can
pick up, not a surprise discovered under load.

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
- **The queue's global ceiling** (Decision 6) — accepted and recorded, not solved.
- **Keyset pagination is new to this codebase** (Decision 4) — one more pagination convention to
  hold in mind alongside offset paging elsewhere; accepted because the two endpoints have different
  correctness requirements, not adopted as a general preference.

## Migration Plan

1. Migration 0006, additive only: `app.moderation_actions`, the `moderation.manage` permission
   seeded and granted to Owner. No existing table is altered.
2. Ship API + admin UI behind the existing deploy pipeline. The new endpoints are useless until
   staff hold `moderation.manage`, which no role holds automatically except the seeded Owner — an
   Owner grants it to whichever role should carry it, the same rollout shape `rbac-management`
   already supports for any new permission.
3. Deploy the admin UI; the Community sidebar group is invisible to any account not holding
   `moderation.manage` (`Sidebar.tsx`'s existing `canSee` gate), so rollout is safe for accounts
   that have not yet been granted the permission.

Rollback: revert the API and admin changes independently of the migration — the new table and
permission are additive and referenced by nothing else, so leaving them in place after a rollback of
the surface is not itself a risk.
