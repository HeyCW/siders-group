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

Non-goals: no reader-facing report/flag system, no bulk actions, no comment editing by staff, no
automated spam detection or wordlists, no appeals workflow, no email notification to a moderated
reader, no general `audit_log` (`docs/ARCHITECTURE.md` §11 still lists this as outstanding, deferred
to a follow-up change — `moderation_actions` is a scoped precursor to it, not a substitute; see
`design.md`).

## Capabilities

### New Capabilities
- `community-moderation`: the admin moderation queue for reader comments and the reader
  mute/ban/unmute/unban surface — one permission, one `moderation_actions` record of every action
  taken, and no new enforcement mechanism, since remove/restore and mute/ban were already enforced
  before this change gave anyone a way to set them.

### Modified Capabilities
- `rbac-management`: the fixed permission catalog gains community moderation alongside the existing
  news, category, tag, media, user, and role management, dashboard access, and system settings
  entries.

## Impact

- **DB**: migration 0006 adds `app.moderation_actions` (`id`, `actor_id` → `app.users(id)`,
  `target_type` enum `comment | reader`, `target_id` uuid with no foreign key — see `design.md`,
  `action` enum, `reason` text nullable, `created_at`), indexed on `(target_type, target_id,
  created_at desc)` and on `created_at desc`; `ENABLE ROW LEVEL SECURITY` with no policies, matching
  every other table (`docs/ARCHITECTURE.md` §6.3); `moderation_actions` added to `GUARDED_TABLES` in
  `apps/api/src/lib/assertDatabaseRole.ts`; `moderation.manage` seeded into `app.permissions` and
  granted to the Owner role, following the catalog block in `supabase/migrations/0000_useful_red_shift.sql`.
- **Contracts**: new `packages/contracts/src/moderation.ts` (list queries, comment and reader
  moderation request/response shapes, the action enum, `.strict()` request bodies matching
  `commentCreateRequestSchema`); `packages/contracts/src/permission.ts` gains `moderation.manage` in
  `PERMISSION_KEYS`.
- **API**: new `apps/api/src/modules/moderation/` (repository / service / controller / routes /
  mapper, matching `engagement/`); every route declares `requirePermission('moderation.manage')`;
  errors via typed `AppError` per `docs/ARCHITECTURE.md` §9.2, 404 for an unknown comment or reader
  id.
- **Admin**: new `apps/admin/src/pages/CommentModerationPage.tsx` and `ReaderModerationPage.tsx` (or
  similarly named), following the `useState`/`useEffect`/`useAsyncAction` pattern
  `PartnersPage.tsx` actually uses; a new "Community" group in `apps/admin/src/components/Sidebar.tsx`
  gated on `moderation.manage`.

## Not modified: `article-engagement`

`specs/article-engagement/spec.md` is not touched by this change, deliberately. Its "A removed
comment is not served" requirement already reads passively — "a comment has been placed in the
removed state" — and never names who or what places it there; it was written agnostic to the
existence of an admin surface, and this change is exactly the thing it was left open for. Likewise,
"Comments require a reader session and publish immediately" already gates on "an authenticated
reader whose account is active", which already covers a banned reader — `requireReader` treats
`status !== 'active'` as no session at all, a behaviour this change relies on rather than changes.
Recording this here so the omission reads as considered, not overlooked.
