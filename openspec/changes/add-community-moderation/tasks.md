## 1. Database

- [ ] 1.1 Add `packages/db/src/schema/moderation.ts`: `moderationTargetType` enum (`comment |
      reader`); `moderationAction` enum (`comment_removed`, `comment_restored`, `reader_muted`,
      `reader_unmuted`, `reader_banned`, `reader_unbanned`); `moderationActions` table (`id`,
      `actorId` → `app.users(id)`, `targetType`, `targetId` uuid with **no** foreign-key reference
      — design.md, Decision 3, `reason` text nullable, `createdAt`). Index on `(targetType,
      targetId, createdAt desc)` for per-target history and on `createdAt desc` for the queue read.
- [ ] 1.2 Export the new table and enums from `packages/db/src/schema/index.ts`.
- [ ] 1.3 Generate the migration (0006). Append `ENABLE ROW LEVEL SECURITY` with no policies,
      matching every other table (`docs/ARCHITECTURE.md` §6.3). Seed `moderation.manage` into
      `app.permissions` and grant it to the Owner role, following the catalog block in
      `supabase/migrations/0000_useful_red_shift.sql`; the migration comment states why this adds a
      new permission key rather than reusing one, citing `0004_steep_leper_queen.sql` as the
      precedent for reuse and design.md - Decision 2 for why this case differs. State explicitly in
      a comment that no column is added to `comments` or `readers` — `status` and `mutedUntil`
      already exist and are already enforced.
- [ ] 1.4 Add `moderation_actions` to `GUARDED_TABLES` in `apps/api/src/lib/assertDatabaseRole.ts`.

## 2. Contracts

- [ ] 2.1 Add `moderation.manage` to `PERMISSION_KEYS` in `packages/contracts/src/permission.ts`.
- [ ] 2.2 Add `packages/contracts/src/moderation.ts`: the moderation action enum; `CommentQueueRow`
      / `CommentQueueResponse` (comment fields, article title/slug, author name, keyset cursor);
      `commentQueueQuerySchema` (status filter `visible | removed | all`, cursor, limit);
      `commentModerateRequestSchema` (`{ status, reason? }`, `.strict()`, matching
      `commentCreateRequestSchema`'s convention); `ReaderQueueRow` / `ReaderQueueResponse` (reader
      fields, mute state, comment count); `readerQueryQuerySchema` (search, status filter);
      `readerModerateRequestSchema` (`{ status?, mutedUntil?, reason? }`, `.strict()`);
      `ModerationActionResponse` (actor, target type/id, action, reason, timestamp) for the
      per-target history read.
- [ ] 2.3 Add `packages/contracts/src/moderation.test.ts` covering the request schemas' `.strict()`
      rejection of unlisted fields, the status-filter enum, and the mute-duration presets.
- [ ] 2.4 Export the new module from `packages/contracts/src/index.ts`.

## 3. API — moderation module

- [ ] 3.1 Add `apps/api/src/modules/moderation/moderation.repository.ts`: keyset-paginated comment
      queue (joined to `articles` for title/slug and `readers` for author name, filtered by
      status), comment status update, keyset cursor comparison on `(createdAt, id)`; reader list
      (search on name/email, status filter, comment count via a join or subquery), reader status /
      `mutedUntil` update; `moderationActions` insert; per-target history read.
- [ ] 3.2 Add `apps/api/src/modules/moderation/moderation.mapper.ts`: row → `CommentQueueRow` /
      `ReaderQueueRow` / `ModerationActionResponse`.
- [ ] 3.3 Add `apps/api/src/modules/moderation/moderation.service.ts`: not-found handling for an
      unknown comment or reader id; comment remove/restore, each writing its `moderationActions` row
      in the same transaction as the `comments.status` update (design.md - Decision 3); reader
      mute/unmute/ban/unban, each writing its `moderationActions` row in the same transaction as the
      `readers` update; queue listing and reader listing pass-throughs.
- [ ] 3.4 Add `apps/api/src/modules/moderation/moderation.controller.ts` and
      `moderation.routes.ts`, mounted at `/admin/comments` and `/admin/readers`. Every route
      declares `requirePermission('moderation.manage')`:
      - `GET /admin/comments` — queue, status filter, keyset cursor.
      - `PATCH /admin/comments/:id` — `{ status, reason? }`; 404 for an unknown id.
      - `GET /admin/readers` — search, status filter.
      - `PATCH /admin/readers/:id` — `{ status?, mutedUntil?, reason? }`; 404 for an unknown id.
      Errors via typed `AppError` per `docs/ARCHITECTURE.md` §9.2.
- [ ] 3.5 Tests: `moderation.service.test.ts` (not-found for both target types on every mutating
      operation; each of the six actions writes exactly one `moderationActions` row with the correct
      `targetType`/`action`; a reader ban does not alter any `comments` row — design.md, Decision 5;
      the queue's status filter; the reader list's search and status filter) and
      `moderation.mapper.test.ts` (ISO formatting, exact public field set, no reader email/id leaked
      into `CommentQueueRow`'s author fields, mirroring `engagement.mapper.ts`'s existing
      `authorName`-only convention). **Not covered by any test, and not coverable without a live
      database:** the keyset cursor's ordering across a page boundary under concurrent insertion, and
      the RLS default-deny posture on `moderation_actions`. Both are exercised by task 5.3.

## 4. Admin

- [ ] 4.1 Add `apps/admin/src/lib/moderationApi.ts`: comment queue list, comment status update,
      reader list, reader status/mute update — over the existing admin fetch wrapper (§8.2's
      403-keyed recovery cycle), matching `partnersApi.ts`'s shape.
- [ ] 4.2 Add `apps/admin/src/pages/CommentModerationPage.tsx`: `useState`/`useEffect`/
      `useAsyncAction`, matching `PartnersPage.tsx` (not TanStack Query — design.md, Risks:
      documentation drift). Status filter tabs (visible / removed / all); each row shows the
      article title/slug, author name, and the comment body rendered as **plain text** — never
      through `sanitizeHtml` or any HTML-interpreting element, matching `comments.body`'s own
      storage contract (`packages/db/src/schema/engagement.ts`). Remove/restore action with an
      optional reason field. Polls every 30 seconds via `setInterval` (matching
      `Sidebar.tsx`'s Jakarta-clock poll), plus a manual refresh control.
- [ ] 4.3 Add `apps/admin/src/pages/ReaderModerationPage.tsx`: same pattern. Search input
      (name/email), status filter, mute state and comment count per row. Mute action offers preset
      durations (24h / 7d / 30d) rather than a free datetime field; ban/unban and unmute actions
      alongside.
- [ ] 4.4 Add a "Community" `NavGroup` to `NAV_GROUPS` in `apps/admin/src/components/Sidebar.tsx`
      with "Comments" (`/moderation/comments`) and "Readers" (`/moderation/readers`), both gated on
      `permission: 'moderation.manage'`.
- [ ] 4.5 Wire the two routes into the admin router alongside the existing page routes.

## 5. Verification

- [ ] 5.1 `pnpm lint`, `pnpm typecheck`, `pnpm test` all clean.
- [ ] 5.2 Confirm the route audit still passes at boot — every new route carries an explicit
      `requirePermission('moderation.manage')` declaration and none is left undeclared
      (`authorize.test.ts`, which fails closed on anything it cannot introspect).
- [ ] 5.3 **Not yet run — needs a live database.** Manual: apply migration 0006; grant
      `moderation.manage` to a test role; remove a comment via the admin queue and confirm it drops
      from the public listing and count immediately (`GET /articles/:id/comments`,
      `GET /articles/:id/engagement`); restore it and confirm it reappears; mute a reader for 24h
      and confirm their next comment attempt is rejected while their existing comments and likes
      remain visible; ban a reader and confirm their session is rejected on the next authenticated
      request while their existing comments remain visible (design.md - Decision 5); unmute and
      unban and confirm both are restored; inspect `app.moderation_actions` after each action and
      confirm exactly one row was written per action, with the correct actor, target, action, and
      timestamp; confirm a reason left blank is stored as null rather than an empty string.
