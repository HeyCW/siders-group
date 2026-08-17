## 0. Authorization (shared middleware)

- [x] 0.1 In `apps/api/src/middleware/authorize.ts`, move the reader `status !== 'active'` check
      out of `requireReader`'s always-reject branch and into the `createsContent` branch,
      alongside the existing `mutedUntil` check, so only content-creating endpoints reject a
      banned reader; every other reader-only endpoint requires only an authenticated reader
      identity (design.md - Decision 7, specs/authorization/spec.md - "Reader-only
      authorization"). Banned readers are rejected with a distinct `reader_banned` code (403),
      parallel to `reader_muted`.
- [x] 0.2 Updated `requireReader`'s doc comment and `RequireReaderOptions.createsContent`'s doc
      comment to describe ban and mute as two flavours of the same "cannot author" sanction,
      differing only in duration, rather than describing ban as account-wide rejection.
- [x] 0.3 Updated `authorize.test.ts`: replaced the single "rejects a banned reader" case with four
      cases — a banned reader allowed through a read request, allowed to like
      (`createsContent: false`), rejected at a content-creating endpoint (`reader_banned`), and
      rejected at a read-method route explicitly declared to create content. 39 tests passing.

## 1. Database

- [x] 1.1 `packages/db/src/schema/moderation.ts`: `moderationTargetType` enum (`comment | reader`);
      `moderationAction` enum, now seven values including `comment_reports_dismissed`;
      `moderationActions` table (`id`, `actorId` → `app.users(id)`, `targetType`, `targetId` uuid
      with **no** foreign-key reference — design.md, Decision 3, `reason` text nullable,
      `createdAt`), indexed on `(targetType, targetId, createdAt)` and on `createdAt`.
- [x] 1.2 Same file: `commentReportReason` enum (`spam`, `harassment`, `off_topic`, `other`) and a
      `commentReports` table — `id`, `commentId` → `app.comments(id)` cascade, `reporterId` →
      `app.readers(id)` cascade, `reason`, `note` nullable, `createdAt`, `resolvedAt` nullable,
      `resolvedBy` → `app.users(id)` nullable. Unique index on `(commentId, reporterId)`; a
      partial index on `commentId` where `resolvedAt is null` for the open-report-count read.
- [x] 1.3 Both tables and all four enums/tables exported from `packages/db/src/schema/index.ts`
      (already a wildcard re-export of the module; no barrel edit needed beyond the module itself).
- [x] 1.4 Migration 0006 (`0006_rare_reptil.sql`) covers both tables in one migration, generated
      fresh after both tables existed in the schema (the schema was extended before the first
      `drizzle-kit generate` ran for this change, so there was never a split 0006/0007 to reconcile).
      `ENABLE ROW LEVEL SECURITY` appended for both, no policies, matching every other table.
      `moderation.manage` seeded into `app.permissions` and granted to Owner via an explicit
      `role_permissions` insert (0000's seed `CROSS JOIN` ran once, at Owner's creation, so a
      permission added afterward needs its own grant). The migration comment cites
      `0004_steep_leper_queen.sql` as the reuse precedent and design.md - Decision 2 for why this
      case differs, and states explicitly that no column is added to `comments` or `readers`.
- [x] 1.5 `moderation_actions` and `comment_reports` both added to `GUARDED_TABLES` in
      `apps/api/src/lib/assertDatabaseRole.ts`.

## 2. Contracts

- [x] 2.1 `moderation.manage` added to `PERMISSION_KEYS` in `packages/contracts/src/permission.ts`.
- [x] 2.2 `packages/contracts/src/moderation.ts`: the seven-value moderation action enum;
      `CommentQueueRow`/`CommentQueueResponse` with `openReportCount`/`reportReasons` present only
      when non-empty; `commentQueueQuerySchema` accepting `visible | removed | all | reported`;
      `commentModerateRequestSchema`; `commentReportReasonSchema`; `commentReportRequestSchema`
      (`{ reason, note? }`, `.strict()`); `CommentReportResponse`; `commentReportsDismissRequestSchema`
      (`{ reason? }`, `.strict()`); `ReaderQueueRow`/`ReaderQueueResponse`; `readerQueueQuerySchema`;
      `readerModerateRequestSchema`; `ModerationActionResponse`.
- [x] 2.3 `packages/contracts/src/moderation.test.ts`: 45 tests, covering `.strict()` rejection on
      every request schema (including the report and dismiss ones), the `reported` filter value,
      the report reason enum, and — for `CommentQueueRow` — that a zero/empty report is omitted
      entirely rather than sent as `0`/`[]`.
- [x] 2.4 Exported from `packages/contracts/src/index.ts`.

## 3. API — moderation module

- [x] 3.1 `apps/api/src/modules/moderation/moderation.repository.ts`: keyset-paginated comment
      queue joined to `articles`/`readers`, with a `LEFT JOIN` to a pre-aggregated
      `comment_reports` subquery (open count + distinct unresolved reasons) rather than a
      `GROUP BY` on the main query — keeps every other join at one-row-per-comment cardinality,
      mirroring `readerRowSelect`'s existing comment-count subquery. The `reported` filter is a
      `coalesce(open_report_count, 0) > 0` predicate over that same join. `setCommentStatus`
      resolves open reports in the same transaction only when the new status is `removed`, never
      on restore. `dismissReports` resolves open reports and logs the action in one transaction,
      returning `null` (not an error) when there was nothing open to resolve, so the service can
      answer not-found without a second existence check. `createReport` lets a unique-constraint
      violation on `(commentId, reporterId)` propagate as a raw driver error for the service to
      translate. Reader list and per-target history unchanged from the original scope.
- [x] 3.2 `moderation.mapper.ts`: `toCommentQueueRow` omits `openReportCount`/`reportReasons`
      entirely for a zero/null count rather than sending `0`/`[]`; `toCommentReportResponse` added,
      carrying no reporter identity.
- [x] 3.3 `moderation.service.ts`: `dismissCommentReports` (not-found for an unknown comment id
      *and* for one with no open reports — both answer the same `not_found`, deliberately
      indistinguishable to the caller); `fileReport` (not-found for an unknown comment, translates
      a unique-constraint violation into `409 already_reported`); `moderateComment`/`updateReader`
      unchanged from the original scope but now share the transaction-atomicity guarantee with the
      two new operations.
- [x] 3.4 `moderation.controller.ts` and `moderation.routes.ts`, now exporting three route
      builders: `commentModerationRoutes` (`GET /admin/comments`, `PATCH /admin/comments/:id`,
      `PATCH /admin/comments/:id/reports/dismiss` — all `requirePermission('moderation.manage')`),
      `readerModerationRoutes` (`GET /admin/readers`, `PATCH /admin/readers/:id` — same
      permission), and `commentReportRoutes` (`POST /comments/:id/report` —
      `requireReader({ createsContent: false })`, **not** permission-gated). Mounted in
      `server.ts` at `/admin/comments`, `/admin/readers`, and `/comments` respectively.
- [x] 3.5 `reportRateLimiter()` added to `middleware/rateLimit.ts`'s `ENGAGEMENT_RATE_LIMITS`
      table: 20/hour, keyed on `req.auth.subjectId` (falling back to address only if `req.auth` is
      absent, which `requireReader` already rules out), its own `name` namespace.
- [x] 3.6 `moderation.service.test.ts` (36 tests) and `moderation.mapper.test.ts` (16 tests), 52
      total: not-found for both target types and for report/dismiss on every mutating operation;
      each action writes exactly one `moderationActions` row with the correct
      `targetType`/`action`; a reader ban never touches a `comments` row; removing a comment
      resolves its open reports in the same operation and restoring does not reopen them; a
      second report from the same reader on the same comment is rejected (409) while a different
      reader's report on the same comment succeeds; filing a report writes no `moderationActions`
      row (it is a reader action, not a staff one); dismissing leaves `comments.status` untouched;
      the queue's `reported` filter and cursor encode/decode; the reader list's search/status
      passthrough; `planReaderModeration`'s transition logic including the combined ban+mute case.
      **Not covered by any test, and not coverable without a live database:** the keyset cursor's
      ordering across a page boundary under concurrent insertion, the report-aggregate subquery's
      actual SQL correctness (`array_agg` under a `FILTER` clause, the `LEFT JOIN` cardinality),
      and the RLS default-deny posture on `moderation_actions` and `comment_reports`. All three are
      exercised by task 5.3.

## 4. Admin

- [x] 4.1 `apps/admin/src/lib/moderationApi.ts`: `listComments` already forwards whatever status
      the caller passes (including `reported`, now that the contract type includes it) with no
      code change beyond the type widening; `dismissCommentReports` added, matching
      `partnersApi.ts`'s shape.
- [x] 4.2 `CommentModerationPage.tsx`: added a fourth status tab (`Reported`); a comment carrying
      `openReportCount` renders an amber badge with the count and the distinct reasons, never for
      a comment with none; a "Dismiss reports" button appears only on rows carrying that badge.
      The single `expandedId` state that gated the remove/restore reason input became
      `expanded: { id, action: 'moderate' | 'dismiss' } | null`, since a row can now expand into
      either of two distinct confirmations that share one reason field but submit through
      different calls.
- [x] 4.3 `ReaderModerationPage.tsx`: rewrote both the doc comment and the page's lead paragraph to
      describe ban as a comment-authoring suspension — the reader stays signed in and keeps
      reading, liking, and reporting — rather than the account lockout the original copy
      described. No structural change to the mute-preset or ban/unban controls themselves, since
      those already called the same generic `moderateReader` endpoint the narrowed semantics run
      through unchanged.
- [x] 4.4 "Community" `NavGroup` in `Sidebar.tsx` with "Comments" (`/moderation/comments`) and
      "Readers" (`/moderation/readers`), both gated on `permission: 'moderation.manage'`.
- [x] 4.5 Both routes wired into `App.tsx` alongside the existing page routes.

## 5. Verification

- [x] 5.1 `pnpm lint`, `pnpm typecheck`, `pnpm test` all clean — 782 tests passing across 91 files.
- [x] 5.2 Route audit confirmed at boot: `health.routes.test.ts` calls the real `createServer()`
      (which runs `auditAuthorizationDeclarations(app)` and throws if any route lacks a
      declaration) and it starts and serves `/health` successfully, with all four staff routes and
      the one reader-gated report route now present.
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
