## 0. Authorization (shared middleware)

- [ ] 0.1 In `apps/api/src/middleware/authorize.ts`, move the reader `status !== 'active'` check
      out of `requireReader`'s always-reject branch (line 117) and into the `createsContent`
      branch, alongside the existing `mutedUntil` check, so only content-creating endpoints reject
      a banned reader; every other reader-only endpoint requires only an authenticated reader
      identity (design.md - Decision 7, specs/authorization/spec.md - "Reader-only authorization").
- [ ] 0.2 Update `requireReader`'s doc comment and `RequireReaderOptions.createsContent`'s doc
      comment to describe ban and mute as two flavours of the same "cannot author" sanction,
      differing only in duration, rather than describing ban as account-wide rejection.
- [ ] 0.3 Update `authorize.test.ts`: replace the "deactivated reader loses session" case with cases
      for a banned reader keeping read, like, and report access, being rejected only at a
      content-creating endpoint, and keeping their existing session usable throughout
      (specs/authorization/spec.md).

## 1. Database

- [ ] 1.1 Add `packages/db/src/schema/moderation.ts`: `moderationTargetType` enum (`comment |
      reader`); `moderationAction` enum (`comment_removed`, `comment_restored`,
      `comment_reports_dismissed`, `reader_muted`, `reader_unmuted`, `reader_banned`,
      `reader_unbanned`); `moderationActions` table (`id`, `actorId` → `app.users(id)`,
      `targetType`, `targetId` uuid with **no** foreign-key reference
      — design.md, Decision 3, `reason` text nullable, `createdAt`). Index on `(targetType,
      targetId, createdAt desc)` for per-target history and on `createdAt desc` for the queue read.
- [ ] 1.2 Add `commentReportReason` enum (`spam`, `harassment`, `off_topic`, `other`) and a
      `commentReports` table to the same schema file: `id`, `commentId` → `app.comments(id)` on
      delete cascade, `reporterId` → `app.readers(id)` on delete cascade, `reason`
      (`commentReportReason`), `note` text nullable, `createdAt`, `resolvedAt` timestamptz
      nullable, `resolvedBy` uuid → `app.users(id)` nullable. Unique index on `(commentId,
      reporterId)` so a reader reports a given comment once. Partial index on `(commentId)` where
      `resolvedAt is null`, sized for the open-report count the queue reads on every load
      (design.md - Decision 8).
- [ ] 1.3 Export the new tables and enums from `packages/db/src/schema/index.ts`.
- [ ] 1.4 Generate the migration (0006), covering both new tables. Append `ENABLE ROW LEVEL
      SECURITY` with no policies on each, matching every other table (`docs/ARCHITECTURE.md` §6.3).
      Seed `moderation.manage` into `app.permissions` and grant it to the Owner role, following the
      catalog block in `supabase/migrations/0000_useful_red_shift.sql`; the migration comment
      states why this adds a new permission key rather than reusing one, citing
      `0004_steep_leper_queen.sql` as the precedent for reuse and design.md - Decision 2 for why
      this case differs. State explicitly in a comment that no column is added to `comments` or
      `readers` — `status` and `mutedUntil` already exist and are already enforced — and that
      `comment_reports` is a new table, not a retrofit of either.
- [ ] 1.5 Add `moderation_actions` and `comment_reports` to `GUARDED_TABLES` in
      `apps/api/src/lib/assertDatabaseRole.ts`.

## 2. Contracts

- [ ] 2.1 Add `moderation.manage` to `PERMISSION_KEYS` in `packages/contracts/src/permission.ts`.
- [ ] 2.2 Add `packages/contracts/src/moderation.ts`: the moderation action enum (seven values,
      including `comment_reports_dismissed`); `CommentQueueRow` / `CommentQueueResponse` (comment
      fields, article title/slug, author name, open report count, distinct report reasons, keyset
      cursor); `commentQueueQuerySchema` (status filter `visible | removed | all | reported`,
      cursor, limit); `commentModerateRequestSchema` (`{ status, reason? }`, `.strict()`, matching
      `commentCreateRequestSchema`'s convention); `commentReportReason` enum;
      `commentReportRequestSchema` (`{ reason, note? }`, `.strict()`); `CommentReportResponse`;
      `commentReportsDismissRequestSchema` (`{ reason? }`, `.strict()`); `ReaderQueueRow` /
      `ReaderQueueResponse` (reader fields, mute state, comment count); `readerQueryQuerySchema`
      (search, status filter); `readerModerateRequestSchema` (`{ status?, mutedUntil?, reason? }`,
      `.strict()`); `ModerationActionResponse` (actor, target type/id, action, reason, timestamp)
      for the per-target history read.
- [ ] 2.3 Add `packages/contracts/src/moderation.test.ts` covering the request schemas' `.strict()`
      rejection of unlisted fields (including the report and dismiss request schemas), the
      status-filter enum's `reported` value, the report reason enum, and the mute-duration presets.
- [ ] 2.4 Export the new module from `packages/contracts/src/index.ts`.

## 3. API — moderation module

- [ ] 3.1 Add `apps/api/src/modules/moderation/moderation.repository.ts`: keyset-paginated comment
      queue (joined to `articles` for title/slug and `readers` for author name, filtered by
      status including `reported`, and joined or subqueried against `commentReports` for the open
      report count and distinct reasons per row), comment status update, keyset cursor comparison
      on `(createdAt, id)`; report insert (unique-constraint conflict on `(commentId, reporterId)`
      surfaced as an already-reported rejection, not a generic 500); resolving a comment's open
      reports (`resolvedAt`/`resolvedBy` set) both as part of the remove transaction and as the
      standalone dismiss action; reader list (search on name/email, status filter, comment count via
      a join or subquery), reader status / `mutedUntil` update; `moderationActions` insert;
      per-target history read.
- [ ] 3.2 Add `apps/api/src/modules/moderation/moderation.mapper.ts`: row → `CommentQueueRow`
      (including `openReportCount` / `reportReasons`) / `ReaderQueueRow` / `ModerationActionResponse`
      / `CommentReportResponse`.
- [ ] 3.3 Add `apps/api/src/modules/moderation/moderation.service.ts`: not-found handling for an
      unknown comment or reader id, including on report and dismiss; comment remove/restore, each
      writing its `moderationActions` row in the same transaction as the `comments.status` update
      (design.md - Decision 3); removing a comment additionally resolves its open reports in that
      same transaction, restoring one does **not** reopen them (design.md - Decision 8); dismissing
      a comment's open reports resolves them and writes a `comment_reports_dismissed`
      `moderationActions` row, without touching `comments.status`; filing a report rejects a second
      report from the same reader on the same comment; reader mute/unmute/ban/unban, each writing
      its `moderationActions` row in the same transaction as the `readers` update; queue listing and
      reader listing pass-throughs.
- [ ] 3.4 Add `apps/api/src/modules/moderation/moderation.controller.ts` and
      `moderation.routes.ts`, mounted at `/admin/comments` and `/admin/readers` for the staff
      routes, plus `/comments/:id/report` for the reader-facing one:
      - `GET /admin/comments` — queue, status filter (`visible | removed | all | reported`), keyset
        cursor. `requirePermission('moderation.manage')`.
      - `PATCH /admin/comments/:id` — `{ status, reason? }`; 404 for an unknown id.
        `requirePermission('moderation.manage')`.
      - `PATCH /admin/comments/:id/reports/dismiss` (or fold into the endpoint above with an action
        discriminator — confirm the exact shape during implementation) — `{ reason? }`; 404 for an
        unknown id or one with no open reports to dismiss. `requirePermission('moderation.manage')`.
      - `GET /admin/readers` — search, status filter. `requirePermission('moderation.manage')`.
      - `PATCH /admin/readers/:id` — `{ status?, mutedUntil?, reason? }`; 404 for an unknown id.
        `requirePermission('moderation.manage')`.
      - `POST /comments/:id/report` — `{ reason, note? }`; 404 for an unknown comment; 409 (or
        equivalent) for a duplicate report from the same reader. `requireReader({ createsContent:
        false })` — **not** permission-gated; a report is a reader action (design.md - Decision 8).
      Errors via typed `AppError` per `docs/ARCHITECTURE.md` §9.2.
- [ ] 3.5 Add a rate limiter for `POST /comments/:id/report` in `middleware/rateLimit.ts`'s
      convention: 20/hour, keyed on `req.auth.subjectId`, in its own `name` namespace, declared
      after `requireReader` so `req.auth` is guaranteed present (design.md - Decision 8, matching
      `add-article-engagement`'s existing per-endpoint limiter table).
- [ ] 3.6 Tests: `moderation.service.test.ts` (not-found for both target types, and for a report or
      dismiss, on every mutating operation; each of the seven actions writes exactly one
      `moderationActions` row with the correct `targetType`/`action`; a reader ban does not alter
      any `comments` row — design.md, Decision 5; a reader ban does not block report, like, or
      read operations, only comment creation — design.md, Decision 7; removing a comment resolves
      its open reports in the same transaction; restoring a comment does not reopen resolved
      reports; dismissing reports leaves `comments.status` untouched; a second report from the same
      reader on the same comment is rejected; the queue's status filter including `reported`; the
      reader list's search and status filter) and `moderation.mapper.test.ts` (ISO formatting, exact
      public field set, no reader email/id leaked into `CommentQueueRow`'s author fields, mirroring
      `engagement.mapper.ts`'s existing `authorName`-only convention; `openReportCount` and
      `reportReasons` present only on rows with open reports). **Not covered by any test, and not
      coverable without a live database:** the keyset cursor's ordering across a page boundary under
      concurrent insertion, and the RLS default-deny posture on `moderation_actions` and
      `comment_reports`. Both are exercised by task 5.3.

## 4. Admin

- [ ] 4.1 Add `apps/admin/src/lib/moderationApi.ts`: comment queue list (including the `reported`
      filter), comment status update, dismiss-reports call, reader list, reader status/mute update
      — over the existing admin fetch wrapper (§8.2's 403-keyed recovery cycle), matching
      `partnersApi.ts`'s shape.
- [ ] 4.2 Add `apps/admin/src/pages/CommentModerationPage.tsx`: `useState`/`useEffect`/
      `useAsyncAction`, matching `PartnersPage.tsx` (not TanStack Query — design.md, Risks:
      documentation drift). Status filter tabs (visible / removed / all / reported); a reported row
      shows its open report count and the reasons given; each row shows the article title/slug,
      author name, and the comment body rendered as **plain text** — never through `sanitizeHtml` or
      any HTML-interpreting element, matching `comments.body`'s own storage contract
      (`packages/db/src/schema/engagement.ts`). Remove/restore action with an optional reason field;
      a dismiss-reports action alongside, enabled only on rows carrying open reports. Polls every 30
      seconds via `setInterval` (matching `Sidebar.tsx`'s Jakarta-clock poll), plus a manual refresh
      control.
- [ ] 4.3 Add `apps/admin/src/pages/ReaderModerationPage.tsx`: same pattern. Search input
      (name/email), status filter, mute state and comment count per row. Mute action offers preset
      durations (24h / 7d / 30d) rather than a free datetime field; ban/unban and unmute actions
      alongside, with copy describing ban as an indefinite comment suspension rather than an account
      lockout (design.md - Decision 7).
- [ ] 4.4 Add a "Community" `NavGroup` to `NAV_GROUPS` in `apps/admin/src/components/Sidebar.tsx`
      with "Comments" (`/moderation/comments`) and "Readers" (`/moderation/readers`), both gated on
      `permission: 'moderation.manage'`.
- [ ] 4.5 Wire the two routes into the admin router alongside the existing page routes.

## 5. Verification

- [ ] 5.1 `pnpm lint`, `pnpm typecheck`, `pnpm test` all clean.
- [ ] 5.2 Confirm the route audit still passes at boot — every new staff route carries an explicit
      `requirePermission('moderation.manage')` declaration, the report route carries an explicit
      `requireReader({ createsContent: false })` declaration, and none is left undeclared
      (`authorize.test.ts`, which fails closed on anything it cannot introspect).
- [ ] 5.3 **Not yet run — needs a live database.** Manual: apply migration 0006; grant
      `moderation.manage` to a test role; remove a comment via the admin queue and confirm it drops
      from the public listing and count immediately (`GET /articles/:id/comments`,
      `GET /articles/:id/engagement`); restore it and confirm it reappears; mute a reader for 24h
      and confirm their next comment attempt is rejected while their existing comments and likes
      remain visible; ban a reader and confirm their session keeps working — they can still read,
      like, and file a report — while their next comment attempt is rejected (design.md - Decision
      7); unmute and unban and confirm comment authoring is restored; file a report from a reader
      account and confirm it appears under the queue's `reported` filter with the correct open
      count and reason; attempt a second report from the same reader on the same comment and
      confirm it is rejected; dismiss that comment's reports and confirm the comment stays visible
      and the report count drops to zero; remove a different comment that has open reports and
      confirm those reports resolve in the same operation; restore it and confirm the resolved
      reports do not reopen; as a banned or muted reader, confirm filing a report still succeeds
      (design.md - Decision 8); inspect `app.moderation_actions` after each staff action and confirm
      exactly one row was written per action (including `comment_reports_dismissed`), with the
      correct actor, target, action, and timestamp; confirm a reason left blank is stored as null
      rather than an empty string.
