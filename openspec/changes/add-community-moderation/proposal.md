## Why

`add-article-engagement` shipped reader comments, likes, and views, and named its moderation
posture explicitly: "manual for this launch, by direct SQL", with an admin moderation queue, a
report/flag system, and a ban or mute UI all listed as non-goals. That change was honest about
what it was deferring, not about what it left unbuilt — the levers it deferred already exist and
are already enforced. `app.comments.status = 'removed'` is filtered out by the one
`visibleComments()` predicate in `engagement.repository.ts` that serves both the public comment
listing and the comment count, so a row with that status simply disappears from both. `requireReader`
in `apps/api/src/middleware/authorize.ts` already rejects a caller whose `access.status !== 'active'`
and already blocks a muted reader (`access.mutedUntil` in the future) at any content-creating
endpoint. Nothing in the product writes `status = 'removed'` on a comment or `status = 'banned'` /
`muted_until` on a reader. A public news site with unmoderated comments and no in-product way to
take one down is the sharp edge the predecessor's proposal named and deferred, and it is still
there.

## What Changes

- Add a new `community-moderation` capability covering both halves of the same job: comment
  remove/restore, and reader mute/ban/unmute/unban. Both go in one change behind one new
  permission, because they are the same staff task — reviewing and acting on reader behaviour —
  not two.
- New API module `apps/api/src/modules/moderation/`, matching the module layout already written at
  `docs/ARCHITECTURE.md:105` (`comments/ moderation/ analytics/ home/ media/ readers/ users/` —
  none of which exist as directories yet; this change is the first to create one of them).
- `GET /admin/comments` — a moderation queue: newest first, filterable by status (`visible` |
  `removed` | `all`), each row joined to its article (title, slug) and author (name), paginated by
  keyset rather than offset.
- `PATCH /admin/comments/:id` — flips a comment's `status` between `visible` and `removed`, with an
  optional `reason`.
- `GET /admin/readers` — a reader list, searchable by name or email, filterable by status, showing
  mute state and comment count.
- `PATCH /admin/readers/:id` — bans or unbans a reader via `status`, and mutes or unmutes via
  `mutedUntil` (a future timestamp to mute, `null` to clear).
- Every mutation writes a row to a new `app.moderation_actions` table, in the same transaction as
  the state change it records — actor, target type and id, action, optional reason, timestamp.
- **No new columns on `comments` or `readers`.** `status` and `muted_until` already exist and are
  already enforced by the code cited above; this change gives staff a way to write them, not a
  reason to add more state.
- A new "Community" sidebar group in `apps/admin`, gated on the new permission, with two entries:
  Comments and Readers.
- The comments queue polls every 30 seconds, matching `docs/ARCHITECTURE.md` §8.2's existing "not
  worth building a websocket layer for a queue two people look at" call for the moderation queue
  specifically, with a manual refresh alongside the poll.
- A comment's body is rendered as plain text in the queue — it is stored as plain text and never
  passed through `sanitizeHtml`, and a moderation screen showing exactly what was published is not
  the place to start interpreting markup that was never meant to render.
- Reader mute offers preset durations (24h / 7d / 30d) rather than a free datetime field.
- Narrow what a ban means. Today `requireReader` (`apps/api/src/middleware/authorize.ts:117`)
  rejects any reader whose `status !== 'active'` in the guard's always-reject branch, ahead of the
  `createsContent` check — so a ban currently fails every reader-only endpoint, not just the ones
  that publish something. This change moves that status check out of the always-reject branch and
  into the `createsContent` branch, next to the mute check that already lives there. A reader's
  ability to author content now requires being neither banned nor currently muted; every other
  reader-only endpoint — read, like, report, the reader's own-account endpoint — requires only an
  authenticated reader identity. Ban and mute become two flavours of the same "cannot author"
  sanction, differing only in duration: mute is time-boxed, ban is indefinite. See `design.md` for
  the consequences this has for account access.
- Add a reader-facing report system, because a moderator today has no way to learn a bad comment
  exists short of reading every row of the newest-first queue: `POST /comments/:id/report`, a new
  `app.comment_reports` table (same migration 0006), a `reported` filter and open-report count on
  the comment queue, and a `dismiss` action that resolves a comment's reports without removing it.
  Reporting is reader-gated, not staff-gated, and neither a mute nor a ban restricts filing one.

Non-goals: no bulk actions, no comment editing by staff, no automated spam detection or wordlists,
no appeals workflow, no email notification to a moderated reader, no general `audit_log`
(`docs/ARCHITECTURE.md` §11 still lists this as outstanding, deferred to a follow-up change —
`moderation_actions` is a scoped precursor to it, not a substitute; see `design.md`). For the report
system specifically: reporting applies to comments only, not articles or reels; a reporter is never
told the outcome of their report; no reputation or trust weighting of reporters; and anonymous
visitors cannot report — reader-gated to keep a report attributable to one account and
rate-limitable per identity, an accepted cost that means a signed-out reader who sees abuse has no
route to flag it.

## Capabilities

### New Capabilities
- `community-moderation`: the admin moderation queue for reader comments and the reader
  mute/ban/unmute/unban surface, plus the reader-facing report intake that feeds it — one
  permission, one `moderation_actions` record of every staff action taken (remove, restore, dismiss
  reports, mute, unmute, ban, unban), and no new enforcement mechanism for remove/restore or
  mute/ban, since both were already enforced before this change gave anyone a way to set them.

### Modified Capabilities
- `rbac-management`: the fixed permission catalog gains community moderation alongside the existing
  news, category, tag, media, user, and role management, dashboard access, and system settings
  entries.
- `authorization`: the reader-only guard's ban check moves from an always-reject precondition into
  the same `createsContent` branch that already gates mute, so a banned reader keeps read, like, and
  report access and only comment authoring is blocked. The requirement that deactivating a reader
  revokes all of their sessions is dropped — it existed only to make the old always-reject ban
  meaningful across a session's lifetime, and narrowing ban removes the one thing it was enforcing.
- `article-engagement`: the like and comment eligibility requirements move off "whose account is
  active" onto the neither-banned-nor-muted formulation this change introduces. The like requirement
  drops the active-account gate entirely, since neither sanction now restricts liking; "A muted
  reader may still like" is renamed to "A sanctioned reader may still like" and extended to cover
  ban as well as mute, for the same reason — a like publishes no reader-authored text.

## Impact

- **DB**: migration 0006 adds `app.moderation_actions` (`id`, `actor_id` → `app.users(id)`,
  `target_type` enum `comment | reader`, `target_id` uuid with no foreign key — see `design.md`,
  `action` enum now carrying seven values including `comment_reports_dismissed`, `reason` text
  nullable, `created_at`), indexed on `(target_type, target_id, created_at desc)` and on
  `created_at desc`; and `app.comment_reports` (`id`, `comment_id` → `app.comments(id)` on delete
  cascade, `reporter_id` → `app.readers(id)` on delete cascade, `reason` enum
  `comment_report_reason` (`spam | harassment | off_topic | other`), `note` text nullable,
  `created_at`, `resolved_at` timestamptz nullable, `resolved_by` uuid → `app.users(id)` nullable),
  with a unique index on `(comment_id, reporter_id)` capping one report per reader per comment and a
  partial index on `(comment_id) where resolved_at is null` for the open-report count the queue
  reads on every load. Both tables: `ENABLE ROW LEVEL SECURITY` with no policies, matching every
  other table (`docs/ARCHITECTURE.md` §6.3); both added to `GUARDED_TABLES` in
  `apps/api/src/lib/assertDatabaseRole.ts`; `moderation.manage` seeded into `app.permissions` and
  granted to the Owner role, following the catalog block in `supabase/migrations/0000_useful_red_shift.sql`.
- **Middleware**: `apps/api/src/middleware/authorize.ts` — `requireReader`'s status check moves from
  the always-reject branch into the `createsContent` branch (see `design.md`).
- **Contracts**: new `packages/contracts/src/moderation.ts` (list queries, comment and reader
  moderation request/response shapes, the moderation action enum, the report request/response
  shapes and reason enum, `.strict()` request bodies matching `commentCreateRequestSchema`);
  `packages/contracts/src/permission.ts` gains `moderation.manage` in `PERMISSION_KEYS`.
- **API**: new `apps/api/src/modules/moderation/` (repository / service / controller / routes /
  mapper, matching `engagement/`); every staff route declares `requirePermission('moderation.manage')`;
  `POST /comments/:id/report` declares `requireReader({ createsContent: false })` instead, rate
  limited 20/hour keyed on reader id in its own namespace (extending `docs/ARCHITECTURE.md` §9.3's
  list, which does not yet include reports); errors via typed `AppError` per `docs/ARCHITECTURE.md`
  §9.2, 404 for an unknown comment or reader id.
- **Admin**: new `apps/admin/src/pages/CommentModerationPage.tsx` and `ReaderModerationPage.tsx` (or
  similarly named), following the `useState`/`useEffect`/`useAsyncAction` pattern
  `PartnersPage.tsx` actually uses; the comment queue gains a `reported` filter tab, an open-report
  count and reasons per row, and a dismiss-reports action; a new "Community" group in
  `apps/admin/src/components/Sidebar.tsx` gated on `moderation.manage`.

## `article-engagement` now requires changes, where the predecessor argued it wouldn't

An earlier revision of this proposal argued `specs/article-engagement/spec.md` needed no change,
on the grounds that "Comments require a reader session and publish immediately" already gated on
"an authenticated reader whose account is active," which already covered a banned reader —
`requireReader` treated `status !== 'active'` as no session at all. That argument depended entirely
on ban continuing to behave as an always-reject condition. Narrowing ban to a comment-authoring
sanction (this revision's Change A) removes that premise, so the conclusion goes with it: the like
and comment eligibility requirements now have to name the sanction directly, because "whose account
is active" no longer means what it used to. See `specs/article-engagement/spec.md` and `design.md`
for the revised requirements.

What is still correctly untouched: "A removed comment is not served" reads passively — "a comment
has been placed in the removed state" — and never names who or what places it there. It was written
agnostic to the existence of an admin surface, and this change is exactly the thing it was left open
for. That requirement needed no change then and needs none now; it is only the *like* and *comment*
eligibility requirements that move.
