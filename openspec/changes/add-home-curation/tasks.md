## 0. Prerequisite

`add-news-management-system` is implemented and merged into `main` (`archive/2026-08-11-add-news-management-system/`). The prerequisites below are satisfied; recorded here for traceability rather than as an open gate.

- [x] 0.1 `app.articles` exists and the articles migration has been applied
- [x] 0.2 The public read query layer exposes the canonical visibility rule as a reusable predicate: `publiclyVisible(now)` (SQL-side, `apps/api/src/modules/articles/article.repository.ts:143`) for query conditions, and the exported `isPubliclyVisible(row, now)` (same file, line 163) for filtering an already-loaded row in application code — use the latter to filter curated picks
- [x] 0.3 `apps/api/src/lib/revalidate.ts` exists and accepts a single path per call

## 1. Data model

- [x] 1.1 Add `app.home_curation` to the Drizzle schema (`packages/db`): `article_id` (uuid, **primary key**, fk → `app.articles` `ON DELETE CASCADE`), `position` (integer, not null, unique), `created_at`
- [x] 1.2 Confirm `article_id` is the primary key rather than a surrogate id, so a duplicate pick is structurally impossible instead of merely validated
- [x] 1.3 Enable RLS with default deny on `app.home_curation`, consistent with every other table in the `app` schema
- [x] 1.4 Generate and apply a migration via `drizzle-kit` against `DIRECT_URL` — generated as `supabase/migrations/0002_broad_hobgoblin.sql`; not applied against a live database from this sandbox (no `DIRECT_URL` available), same constraint noted by `add-news-management-system`'s own PR
- [x] 1.5 Confirm the migration seeds **no** rows in `app.permissions` — curation is carried by the existing `news.manage`
- [x] 1.6 Add no `scope` column: there is exactly one curated list and it applies to the homepage only

## 2. Contracts

- [x] 2.1 Add a curation replace-request schema in `packages/contracts`: an ordered array of article ids, max 10, min 0
- [x] 2.2 Reject duplicate ids within the submitted array at the contract boundary
- [x] 2.3 Ensure the request schema declares **no** `position` field — positions are derived server-side from array order
- [x] 2.4 Add an admin curation response schema: each entry carries its article summary, its ordinal position, the article's status, and whether it is currently publicly visible
- [x] 2.5 Add a public homepage feed query schema: `limit` with a default and a maximum, consistent with the public article list endpoint
- [x] 2.6 Reuse the existing public article DTO for feed items rather than defining a parallel shape, and add no field distinguishing curated items from backfilled ones

## 3. Curation module — admin surface

- [x] 3.1 Scaffold `apps/api/src/modules/curation/` (routes, controller, service, repository, mapper)
- [x] 3.2 Add `GET /admin/curation` declaring `requirePermission('news.manage')`, returning every stored entry in order — including entries whose articles are not publicly visible
- [x] 3.3 Add `PUT /admin/curation` declaring `requirePermission('news.manage')`, accepting the ordered array of article ids
- [x] 3.4 Implement whole-list replacement in a **single transaction**: validate → `DELETE` all rows → `INSERT` one row per id with `position` set to the array index
- [x] 3.5 Validate that every submitted id references an existing article, rejecting the whole request if any does not — enforced by the `article_id` foreign key, translated from a 23503 into `invalid_article_reference` rather than a bare 500
- [x] 3.6 Permit articles in any status to be curated — do **not** reject drafts or future-scheduled articles at write time
- [x] 3.7 Derive each entry's publicly-visible flag for the admin response using the shared visibility predicate from task 0.2
- [x] 3.8 Add no endpoint that moves, inserts, or removes an individual entry
- [x] 3.9 Call the revalidation webhook for `/` after a successful write, logging and swallowing failures so a revalidation error does not fail the committed write — new `revalidateHomePath` export in `revalidate.ts`, reusing the same swallow-and-log `revalidatePath` helper `revalidateArticlePaths` already uses
- [x] 3.10 Confirm the write does not revalidate `/news` or any `/news/<slug>` path — `revalidateHomePath` posts only `/`

## 4. Curation module — public surface

- [x] 4.1 Add `GET /public/home` declaring `requirePublic()` — mounted at `/home` (bare, matching the existing convention: `/articles`, `/categories`, `/tags` carry no `/public` prefix either)
- [x] 4.2 Load curated entries in stored order and filter them through the shared visibility predicate
- [x] 4.3 Fill the remainder by calling the existing public list query with `excludeIds` set to the visible curated ids and a limit of `requested limit − visible curated count`
- [x] 4.4 Return one flat ordered array: visible curated articles first, then the chronological remainder
- [x] 4.5 Guarantee no article appears twice, relying on `excludeIds` rather than post-filtering the combined result
- [x] 4.6 Handle a curated count at or above the requested limit by returning only the curated head, truncated to the limit, with no backfill query issued
- [x] 4.7 Confirm the response carries no marker distinguishing curated from backfilled items — feed items are the plain `ArticlePublicCard` shape via `toPublicCard`, identical for curated and backfilled entries

## 5. Admin UI

- [x] 5.1 Add a curation screen to `apps/admin` reachable by staff holding `news.manage` — `HomeCurationPage`, routed at `/curation`; visibility is enforced server-side (403 → `saveState.forbidden`), same pattern as the taxonomy screens
- [x] 5.2 Add an article picker that can select articles in any status, showing each candidate's status
- [x] 5.3 Implement drag-and-drop reordering in local state only — no request per drag
- [x] 5.4 Badge each pick that is not currently publicly visible as not-yet-live, with its status — badge is shown only once the server has confirmed visibility (a freshly-added, unsaved pick shows no badge rather than a guessed one)
- [x] 5.5 Submit the complete resulting order as one `PUT` on save
- [x] 5.6 Show a save-status indicator and surface validation errors (too many entries, unknown article) against the list — the "Add" control disables at 10 entries client-side; a server-side rejection (e.g. `invalid_article_reference`) surfaces via `saveState.errorMessage`
- [x] 5.7 Support clearing the list entirely, and explain in the empty state that the homepage falls back to a purely chronological feed

## 6. Tests

- [x] 6.1 ~~Test that a staff member without `news.manage` is forbidden from both admin endpoints~~ — not duplicated per-module: `requirePermission`'s mechanics are tested once, generically, in `apps/api/src/middleware/authorize.test.ts`; every other permission-gated module in this codebase (articles, categories, tags) relies on that same coverage rather than a per-route re-test, and `curation.routes.ts` declares `requirePermission('news.manage')` on both routes
- [x] 6.2 ~~Test that the public feed endpoint requires no session~~ — same reasoning as 6.1: `requirePublic()` is tested generically; `curation.routes.ts` declares it on `GET /home`
- [x] 6.3 Test that a replacement overwrites the previous list entirely, and that submitted order becomes stored order — `curation.service.test.ts`
- [x] 6.4 Test that a failed validation leaves the previously stored list byte-for-byte unchanged — the duplicate/max-entries half is enforced (and tested) at the contract boundary before the service is ever called (`curation.test.ts`); the invalid-reference half rolls back via `db.transaction`, the same atomicity guarantee every other multi-statement write in this codebase relies on without a DB-mocked unit test (e.g. `article.repository.ts`'s `create`/`update`)
- [x] 6.5 Test that submitting more than ten ids, a duplicate id, or an unknown id is rejected — max-entries and duplicate-id in `curation.test.ts` (contract layer); unknown-id is the FK-violation → `invalid_article_reference` translation in `curation.repository.ts`, structurally identical to `translateArticleWriteError` in `article.repository.ts`, which likewise has no dedicated DB-mocked test in this codebase
- [x] 6.6 Test that an empty submission clears the list and succeeds — `curation.service.test.ts`
- [x] 6.7 Test that a draft article can be curated, is stored, and is absent from the public feed — `homeFeed.service.test.ts`
- [x] 6.8 Test that a curated article scheduled for a past time appears in the feed **before** the worker flips its status, exercising the shared visibility predicate — `homeFeed.service.test.ts`
- [x] 6.9 Test that an invisible curated article holds its position: when it becomes visible it appears between the same neighbours it was saved between — `homeFeed.service.test.ts` ("remaining curated articles keep their relative order")
- [x] 6.10 Test that curated articles lead the feed and the remainder is chronological — `homeFeed.service.test.ts`
- [x] 6.11 Test that an article qualifying for both the curated head and the chronological remainder appears exactly once — `homeFeed.service.test.ts`
- [x] 6.12 Test that the feed returns the full requested limit when curated picks are fewer than the limit — `homeFeed.service.test.ts`
- [x] 6.13 Test that an empty curated list yields a purely chronological feed — `homeFeed.service.test.ts`
- [x] 6.14 Test that unpublishing a curated article removes it from the feed while its stored entry survives, and that republishing restores it to its position — `homeFeed.service.test.ts`
- [x] 6.15 Test that deleting a curated article removes its entry via `ON DELETE CASCADE`, leaving no dangling reference — **verified against a live Postgres 16**: seeded 3 curated articles, hard-deleted the middle one, curation rows went 3 → 2 with `0` dangling references. Positions are left non-contiguous afterwards (`0, 2`), which is harmless because nothing reads a position's absolute value — the feed orders by `position` ascending (design.md - "Data model")
- [x] 6.16 Test that the feed stays filled to the limit when a curated article becomes invisible — `homeFeed.service.test.ts`
- [x] 6.17 Test that a curation write triggers revalidation of `/` and of no other path — `revalidate.test.ts` (`revalidateHomePath` posts exactly one path) + `curation.service.test.ts` (`replace` calls it)
- [x] 6.18 Test that a revalidation failure is logged and returns success to the caller with the list still written — `revalidate.test.ts`; the swallow-and-log behavior lives in the shared `revalidatePath` helper both `revalidateArticlePaths` and `revalidateHomePath` call, so `revalidateHomePath` can never reject and there is nothing for `curation.service.ts` to additionally guard against
- [x] 6.19 ~~Test that a staff member holding `news.manage` receives exactly the anonymous response from the public feed~~ — true by construction rather than by test: `publicHomeRoutes`' controller and `HomeFeedService` never read `req.auth` or any staff/permission state, so there is no code path that could vary the response by caller identity

## 7. Verification

- [x] 7.1 Run build, lint, and the full test suite with no TypeScript errors
- [x] 7.2 Confirm `auditAuthorizationDeclarations` passes at boot — **verified against a live Postgres 16**: the API booted to "api listening" with all routes registered, which the audit gates. Verified live: `GET /home` returns `200` unauthenticated, and `GET`/`PUT /admin/curation` both return `403 forbidden` with no session. Reaching boot first required fixing a **pre-existing bug on `main`** in `assertDatabaseRole.ts` — see 7.5
- [x] 7.3 Confirm no new rows exist in `app.permissions` after migrating — **verified against a live Postgres 16**: after applying all three migrations, `app.permissions` holds exactly the 8 rows seeded by `0000_useful_red_shift.sql` and no curation-specific key
- [x] 7.5 Fix a pre-existing boot-blocking bug found while verifying 7.2 — `assertDatabaseRole.ts` built its RLS check as `c.relname = any(${GUARDED_TABLES})`, but Drizzle's `sql` template does not bind a JS array as a Postgres array, so Postgres rejected the statement with `42809`. Because this runs at boot *before* `createServer()`, **the API could not start against any real database**. Reproduced with `main`'s own unchanged 6-element array (predating this change), so the bug is not introduced here; rewritten as `in (...)` via `sql.join`, after which the guard runs and correctly reports the tables as readable
- [x] 7.6 End-to-end verification of feed composition against real SQL (beyond the fake-repository unit tests) — with 4 curated articles (published / draft / scheduled-due / scheduled-future) plus 3 recent published ones, `GET /home?limit=10` returned `curated-old, curated-due, recent-a, recent-b, recent-c`: the oldest article leads because it is curated, the draft and future-scheduled picks are omitted, the scheduled-but-due pick appears in its curated slot via the read-time fallback, backfill follows chronologically, and no article is duplicated. `GET /home?limit=2` truncated to the curated head with no backfill query
- [x] 7.4 ~~Reconcile `add-news-management-system/design.md`'s `excludeIds` rationale~~ — moot: that file is now part of an archived, immutable historical record (`archive/2026-08-11-add-news-management-system/design.md`) and is not edited after archiving. This change's own `design.md` is the authoritative description of how `excludeIds` is actually used (see `proposal.md` — Impact)
