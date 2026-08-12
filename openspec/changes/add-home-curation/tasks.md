## 0. Prerequisite

`add-news-management-system` is implemented and merged into `main` (`archive/2026-08-11-add-news-management-system/`). The prerequisites below are satisfied; recorded here for traceability rather than as an open gate.

- [x] 0.1 `app.articles` exists and the articles migration has been applied
- [x] 0.2 The public read query layer exposes the canonical visibility rule as a reusable predicate: `publiclyVisible(now)` (SQL-side, `apps/api/src/modules/articles/article.repository.ts:143`) for query conditions, and the exported `isPubliclyVisible(row, now)` (same file, line 163) for filtering an already-loaded row in application code — use the latter to filter curated picks
- [x] 0.3 `apps/api/src/lib/revalidate.ts` exists and accepts a single path per call

## 1. Data model

- [ ] 1.1 Add `app.home_curation` to the Drizzle schema (`packages/db`): `article_id` (uuid, **primary key**, fk → `app.articles` `ON DELETE CASCADE`), `position` (integer, not null, unique), `created_at`
- [ ] 1.2 Confirm `article_id` is the primary key rather than a surrogate id, so a duplicate pick is structurally impossible instead of merely validated
- [ ] 1.3 Enable RLS with default deny on `app.home_curation`, consistent with every other table in the `app` schema
- [ ] 1.4 Generate and apply a migration via `drizzle-kit` against `DIRECT_URL`
- [ ] 1.5 Confirm the migration seeds **no** rows in `app.permissions` — curation is carried by the existing `news.manage`
- [ ] 1.6 Add no `scope` column: there is exactly one curated list and it applies to the homepage only

## 2. Contracts

- [ ] 2.1 Add a curation replace-request schema in `packages/contracts`: an ordered array of article ids, max 10, min 0
- [ ] 2.2 Reject duplicate ids within the submitted array at the contract boundary
- [ ] 2.3 Ensure the request schema declares **no** `position` field — positions are derived server-side from array order
- [ ] 2.4 Add an admin curation response schema: each entry carries its article summary, its ordinal position, the article's status, and whether it is currently publicly visible
- [ ] 2.5 Add a public homepage feed query schema: `limit` with a default and a maximum, consistent with the public article list endpoint
- [ ] 2.6 Reuse the existing public article DTO for feed items rather than defining a parallel shape, and add no field distinguishing curated items from backfilled ones

## 3. Curation module — admin surface

- [ ] 3.1 Scaffold `apps/api/src/modules/curation/` (routes, controller, service, repository, mapper)
- [ ] 3.2 Add `GET /admin/curation` declaring `requirePermission('news.manage')`, returning every stored entry in order — including entries whose articles are not publicly visible
- [ ] 3.3 Add `PUT /admin/curation` declaring `requirePermission('news.manage')`, accepting the ordered array of article ids
- [ ] 3.4 Implement whole-list replacement in a **single transaction**: validate → `DELETE` all rows → `INSERT` one row per id with `position` set to the array index
- [ ] 3.5 Validate that every submitted id references an existing article, rejecting the whole request if any does not
- [ ] 3.6 Permit articles in any status to be curated — do **not** reject drafts or future-scheduled articles at write time
- [ ] 3.7 Derive each entry's publicly-visible flag for the admin response using the shared visibility predicate from task 0.2
- [ ] 3.8 Add no endpoint that moves, inserts, or removes an individual entry
- [ ] 3.9 Call the revalidation webhook for `/` after a successful write, logging and swallowing failures so a revalidation error does not fail the committed write
- [ ] 3.10 Confirm the write does not revalidate `/news` or any `/news/<slug>` path

## 4. Curation module — public surface

- [ ] 4.1 Add `GET /public/home` declaring `requirePublic()`
- [ ] 4.2 Load curated entries in stored order and filter them through the shared visibility predicate
- [ ] 4.3 Fill the remainder by calling the existing public list query with `excludeIds` set to the visible curated ids and a limit of `requested limit − visible curated count`
- [ ] 4.4 Return one flat ordered array: visible curated articles first, then the chronological remainder
- [ ] 4.5 Guarantee no article appears twice, relying on `excludeIds` rather than post-filtering the combined result
- [ ] 4.6 Handle a curated count at or above the requested limit by returning only the curated head, truncated to the limit, with no backfill query issued
- [ ] 4.7 Confirm the response carries no marker distinguishing curated from backfilled items

## 5. Admin UI

- [ ] 5.1 Add a curation screen to `apps/admin` reachable by staff holding `news.manage`
- [ ] 5.2 Add an article picker that can select articles in any status, showing each candidate's status
- [ ] 5.3 Implement drag-and-drop reordering in local state only — no request per drag
- [ ] 5.4 Badge each pick that is not currently publicly visible as not-yet-live, with its status
- [ ] 5.5 Submit the complete resulting order as one `PUT` on save
- [ ] 5.6 Show a save-status indicator and surface validation errors (too many entries, unknown article) against the list
- [ ] 5.7 Support clearing the list entirely, and explain in the empty state that the homepage falls back to a purely chronological feed

## 6. Tests

- [ ] 6.1 Test that a staff member without `news.manage` is forbidden from both admin endpoints, and that the stored list is unchanged
- [ ] 6.2 Test that the public feed endpoint requires no session
- [ ] 6.3 Test that a replacement overwrites the previous list entirely, and that submitted order becomes stored order
- [ ] 6.4 Test that a failed validation leaves the previously stored list byte-for-byte unchanged
- [ ] 6.5 Test that submitting more than ten ids, a duplicate id, or an unknown id is rejected
- [ ] 6.6 Test that an empty submission clears the list and succeeds
- [ ] 6.7 Test that a draft article can be curated, is stored, and is absent from the public feed
- [ ] 6.8 Test that a curated article scheduled for a past time appears in the feed **before** the worker flips its status, exercising the shared visibility predicate
- [ ] 6.9 Test that an invisible curated article holds its position: when it becomes visible it appears between the same neighbours it was saved between
- [ ] 6.10 Test that curated articles lead the feed and the remainder is chronological
- [ ] 6.11 Test that an article qualifying for both the curated head and the chronological remainder appears exactly once
- [ ] 6.12 Test that the feed returns the full requested limit when curated picks are fewer than the limit
- [ ] 6.13 Test that an empty curated list yields a purely chronological feed
- [ ] 6.14 Test that unpublishing a curated article removes it from the feed while its stored entry survives, and that republishing restores it to its position
- [ ] 6.15 Test that deleting a curated article removes its entry via `ON DELETE CASCADE`, leaving no dangling reference
- [ ] 6.16 Test that the feed stays filled to the limit when a curated article becomes invisible
- [ ] 6.17 Test that a curation write triggers revalidation of `/` and of no other path
- [ ] 6.18 Test that a revalidation failure is logged and returns success to the caller with the list still written
- [ ] 6.19 Test that a staff member holding `news.manage` receives exactly the anonymous response from the public feed

## 7. Verification

- [ ] 7.1 Run build, lint, and the full test suite with no TypeScript errors
- [ ] 7.2 Confirm `auditAuthorizationDeclarations` passes at boot — every new route declares a permission or `requirePublic()`
- [ ] 7.3 Confirm no new rows exist in `app.permissions` after migrating
- [x] 7.4 ~~Reconcile `add-news-management-system/design.md`'s `excludeIds` rationale~~ — moot: that file is now part of an archived, immutable historical record (`archive/2026-08-11-add-news-management-system/design.md`) and is not edited after archiving. This change's own `design.md` is the authoritative description of how `excludeIds` is actually used (see `proposal.md` — Impact)
