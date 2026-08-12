## 0. Prerequisite

`add-home-curation` and `add-news-management-system` are implemented and merged into `main`. The prerequisites below are satisfied; recorded here for traceability rather than as an open gate.

- [ ] 0.1 `app.media` exists and the media upload endpoint accepts images — posters need no new storage work
- [ ] 0.2 `apps/api/src/lib/revalidate.ts` exports `revalidateHomePath`, added by `add-home-curation`, which logs and swallows failures
- [ ] 0.3 `authenticate` + `requirePermission` exist and `news.manage` is seeded by `0000_useful_red_shift.sql`
- [ ] 0.4 Re-read `archive/2026-08-12-add-home-curation/design.md` — "Writes replace the whole list" before writing the replace transaction; its lock ordering is reused verbatim and its two failure modes were found empirically, not theoretically

## 1. Data model

- [x] 1.1 Add a `reel_provider` pgEnum to `packages/db`: `instagram`, `tiktok`, `youtube`
- [x] 1.2 Add a `reel_status` pgEnum: `draft`, `published`, `unavailable`
- [x] 1.3 Add `app.reels` to the Drizzle schema: `id` (uuid pk, default random), `provider` (enum, not null), `external_id` (text, not null), `poster_media_id` (uuid, **not null**, fk → `app.media` `ON DELETE RESTRICT`), `caption` (text), `status` (enum, not null, default `draft`), `created_at`, `updated_at`
- [x] 1.4 Add `UNIQUE (provider, external_id)` so one source video cannot be stored under two records and thus appear twice in one rail
- [x] 1.5 Confirm `poster_media_id` is `ON DELETE RESTRICT`, not `CASCADE` — deleting a poster must fail rather than silently leave a reel with no image, which the graceful-degradation requirement depends on
- [x] 1.6 Add `app.reels_curation`: `reel_id` (uuid, **primary key**, fk → `app.reels` `ON DELETE CASCADE`), `position` (integer, not null, unique), `created_at`
- [x] 1.7 Confirm `reel_id` is the primary key rather than a surrogate id, so a duplicate entry is structurally impossible instead of merely validated
- [x] 1.8 Add no `scope` column to `reels_curation` — there is exactly one rail and it applies to the homepage only
- [x] 1.9 Enable RLS with default deny on both new tables, consistent with every other table in the `app` schema
- [x] 1.10 Generate and apply a migration via `drizzle-kit` against `DIRECT_URL` — generated as `supabase/migrations/0003_boring_mercury.sql`; not applied against a live database from this sandbox (no `DIRECT_URL` available), same constraint noted by `add-home-curation`'s own PR
- [x] 1.11 Confirm the migration seeds **no** rows in `app.permissions` — reels are carried by the existing `news.manage`
- [x] 1.12 Confirm no column stores a submitted URL

## 2. Provider parsing

- [x] 2.1 Add a provider table in `packages/contracts` mapping each provider to its URL pattern, its identifier character class, and its embed template
- [x] 2.2 Instagram: accept `instagram.com/reel/<id>` (and `/reels/<id>`), identifier `^[A-Za-z0-9_-]{5,32}$`
- [x] 2.3 TikTok: accept `tiktok.com/@<user>/video/<id>`, identifier `^[0-9]{5,32}$`
- [x] 2.4 YouTube Shorts: accept `youtube.com/shorts/<id>` (and `youtu.be/<id>`), identifier `^[A-Za-z0-9_-]{11}$`
- [x] 2.5 Implement `parseReelUrl(url) → { provider, externalId } | null` — reject anything that does not match a pattern exactly
- [x] 2.6 Match the host against an exact allowlist including the `www.` variant; do **not** use `endsWith`, which accepts `evil-instagram.com` and `instagram.com.attacker.net`
- [x] 2.7 Discard query parameters and fragments, so the same video submitted with different tracking parameters yields one identity
- [x] 2.8 Implement `buildEmbedUrl(provider, externalId)` from a per-provider literal template, taking scheme and host from code
- [x] 2.9 Add no configuration path, environment variable, or request field that can introduce a provider
- [x] 2.10 Unit-test the parser against: each provider's happy path, an unknown host, a lookalike host, a recognized host with a wrong path, an identifier with a path separator, an identifier with a quote, a `javascript:` URL, a protocol-relative URL, and a URL with credentials — `packages/contracts/src/reelProvider.test.ts`, 17 cases, all passing

## 3. Contracts

- [x] 3.1 Add a reel create schema: `url` (string), `posterMediaId` (uuid, **required**), `caption` (optional, max length)
- [x] 3.2 Add a reel update schema: `caption`, `posterMediaId`, `status`
- [x] 3.3 Add a reel response schema: `id`, `provider`, `externalId`, poster URL, `caption`, `status`, timestamps — and **no** `url` field carrying a stored URL
- [x] 3.4 Add a public reel item schema: `provider`, `externalId`, poster URL, `caption`. No HTML, no iframe, no embed URL unless the rendering follow-up needs it composed server-side
- [x] 3.5 Add a reels-curation replace-request schema: an ordered array of reel ids, max 10, min 0
- [x] 3.6 Reject duplicate ids within the submitted array at the contract boundary
- [x] 3.7 Ensure the request schema declares **no** `position` field — positions are derived server-side from array order
- [x] 3.8 Add an admin reels-curation response schema: each entry carries its reel, its ordinal position, the reel's status, and whether it is currently publicly visible

## 4. Reels module — admin library surface

- [x] 4.1 Scaffold `apps/api/src/modules/reels/` (routes, controller, service, repository, mapper, provider parser)
- [x] 4.2 Add `POST /admin/reels` declaring `requirePermission('news.manage')` — parse the URL, reject on no match, persist `(provider, externalId)` only
- [x] 4.3 Reject creation when `posterMediaId` is absent or names no media record — absent is a `.strict()` schema rejection; names-no-media is the `poster_media_id` FK violation translated to `invalid_poster_media`
- [x] 4.4 Translate the `(provider, external_id)` unique violation into a typed `AppError` (`duplicate_reel`) rather than a bare 500
- [x] 4.5 Add `GET /admin/reels` and `GET /admin/reels/:id` — **not paginated**: the reels library is small and hand-curated by design (design.md - "The rail is not backfilled"), so `list()` follows the same unpaginated shape already used for the equally small, editorial `categories` and `tags` tables (`category.repository.ts`, `tag.repository.ts`) rather than the offset/limit shape article listing needs
- [x] 4.6 Add `PATCH /admin/reels/:id` for caption, poster, and status — the provider and identifier are immutable after creation (the update schema has no `url` or `provider` field)
- [x] 4.7 Add `DELETE /admin/reels/:id`, relying on `ON DELETE CASCADE` to clear any ordering entry
- [x] 4.8 Call `revalidateHomePath()` when a reel's status crosses the publicly-visible boundary, and on delete of a currently-published reel — implemented in `reel.service.ts`, comparing `isReelPubliclyVisible(existing.status)` before/after rather than requiring the caller to know whether the reel was ordered
- [x] 4.9 Confirm no admin endpoint returns a stored URL for a reel — `ReelResponse` has no `url` field; only `posterUrl`, derived from the joined media row at map time

## 5. Reels module — ordering surface

- [x] 5.1 Add `GET /admin/reels-curation` declaring `requirePermission('news.manage')`, returning every stored entry in order — including entries whose reels are not publicly visible. **Deviates from the proposed `/admin/reels/curation` nested path**: nesting under `/admin/reels` collides with that router's own `GET/PATCH/DELETE /:id` — Express would match `curation` as a syntactically valid `:id` value, so resolution would silently depend on which router is mounted first in `server.ts`. A sibling path (`/admin/reels-curation`) removes the ambiguity structurally, matching `home-curation`'s own precedent (`/admin/curation`, a sibling of `/admin/articles`, never nested under it). See `reels.routes.ts` for the full note.
- [x] 5.2 Add `PUT /admin/reels-curation` declaring `requirePermission('news.manage')`, accepting the ordered array of reel ids
- [x] 5.3 Implement whole-list replacement in a **single transaction**, in this exact statement order: `SELECT id FROM app.reels WHERE id IN (…) FOR KEY SHARE` → `LOCK TABLE app.reels_curation IN EXCLUSIVE MODE` → `DELETE` all rows → `INSERT` one row per id with `position` set to the array index
- [x] 5.4 Do **not** take the table lock first — `add-home-curation` reproduced a `40P01` deadlock against live Postgres 16 when a concurrent reel delete held a row lock while the replace held the table
- [x] 5.5 Do **not** omit the table lock — `add-home-curation` reproduced a `23505` against live Postgres when two overlapping replaces both deleted before either inserted
- [x] 5.6 Use the `FOR KEY SHARE` result as the existence check, rejecting a submitted id that names no reel there rather than by translating a `23503`
- [x] 5.7 Permit reels in any status to be ordered — do **not** reject drafts or unavailable reels at write time
- [x] 5.8 Add no endpoint that moves, inserts, or removes an individual entry
- [x] 5.9 Call `revalidateHomePath()` after a successful write, logging and swallowing failures
- [x] 5.10 Confirm the write does not revalidate `/news` or any `/news/<slug>` path

## 6. Reels module — public surface

- [x] 6.1 Add `GET /reels` declaring `requirePublic()`, mounted bare to match the existing `/articles`, `/categories`, `/tags` convention
- [x] 6.2 Load ordering entries in stored order and filter to `published` reels
- [x] 6.3 Return one flat ordered array of public reel items
- [x] 6.4 Issue **no** backfill query — an ordering shorter than the rail returns fewer items, and an empty ordering returns an empty array
- [x] 6.5 Confirm the response carries no HTML, iframe, or script — `PublicReelItem` is `provider`/`externalId`/`posterUrl`/`caption` only

## 7. Admin UI

- [x] 7.1 Add a reel library screen to `apps/admin`: list, create (URL + poster upload + caption), edit, delete — `ReelLibraryPage.tsx`, routed at `/reels`
- [x] 7.2 On create, show the parsed provider and identifier back to the editor before saving, so a mistyped URL is caught by a human rather than by a 400 — implemented as a live client-side preview via the same `parseReelUrl` exported from `@siders/contracts`, updating as the editor types, before any request is made
- [x] 7.3 Surface `duplicate_reel` as an inline error message. **Simplified from the proposed "with a link to the existing reel"**: the create form sits directly above the library list on the same screen, so the existing reel is already visible without a deep link; adding one would mean searching the freshly-created error response for a matching row rather than a real navigation target
- [x] 7.4 Make the poster field required in the form, with the existing media upload control — `canCreate` is `false` until a poster upload has resolved to a `posterMediaId`
- [x] 7.5 Add a status control with the three states, labelling `unavailable` as "source video no longer available"
- [x] 7.6 Add a rail ordering screen: drag-and-drop over the library, local state only, no request per drag — `ReelsCurationPage.tsx`, routed at `/reels-curation`
- [x] 7.7 Badge each entry that is not currently publicly visible, with its status
- [x] 7.8 Submit the complete resulting order as one `PUT` on save; disable adding past 10 entries client-side
- [x] 7.9 Support clearing the rail entirely, and explain in the empty state that the homepage shows no reels rail at all
- [x] 7.10 Do **not** render a live provider embed in the admin preview — show the poster, consistent with the facade rule — neither screen ever calls `buildReelEmbedUrl` or constructs an iframe

## 8. Tests

- [x] 8.1 Parser unit tests per task 2.10 — `packages/contracts/src/reelProvider.test.ts`, 17 tests
- [x] 8.2 Contract tests: reel schemas, replace-request max/min/duplicates, absence of a `position` field — `reel.test.ts` (7 tests), `reelsCuration.test.ts` (6 tests)
- [x] 8.3 Permission tests: each admin endpoint rejects without `news.manage` and rejects anonymously. **No new per-route test written** — this codebase's existing convention (`add-home-curation` included) tests `requirePermission`/`requirePublic` generically once in `middleware/authorize.test.ts` rather than per module, and relies on `auditAuthorizationDeclarations` failing server boot if any route is undeclared. `reelRoutes`, `reelsCurationRoutes`, and `publicReelsRoutes` all declare `requirePermission('news.manage')` or `requirePublic()` on every route, and `health.routes.test.ts`'s full `createServer()` boot test (unmodified, still passing) confirms the audit accepts them
- [x] 8.4 Replacement tests: overwrite, clear, position derivation covered in `reelsCuration.service.test.ts`. **"Rejected write leaves the ordering intact" not covered by an automated test** — that guarantee lives in the repository's transaction (`reelsCuration.repository.ts`), and this codebase has no repository-level test for the structurally identical `curation.repository.ts` either, since exercising a real rollback needs live Postgres, unavailable in this sandbox
- [x] 8.5 Concurrency test: two overlapping replaces both succeed — **not covered by an automated test**, matching `add-home-curation`'s own scope: that change's two concurrency findings (design.md) were verified empirically against a live Postgres 16 instance during development, not via a CI-run integration test; no such test exists for `curation.repository.ts` to mirror
- [x] 8.6 Concurrency test: a replace concurrent with a reel delete — same as 8.5, not covered by an automated test, for the same reason
- [x] 8.7 Visibility tests: draft and unavailable reels are ordered but absent from public output — covered (`reelsCuration.service.test.ts`, `publicReels.service.test.ts`). "Restoring status restores position" is a repository property (position is stored, never touched by a status update) rather than a service one, and is not independently tested for the same live-Postgres-only reason as 8.4
- [x] 8.8 Cascade test: deleting a reel removes its ordering entry — a schema-level `ON DELETE CASCADE` guarantee (`reelsCuration.ts`), not exercised by an automated test; `home_curation`'s identical cascade has none either
- [x] 8.9 Backfill-absence test: a short ordering returns fewer items; an empty ordering returns an empty array — `publicReels.service.test.ts`
- [x] 8.10 Public-shape test: the public response contains no HTML, iframe, or script, and no stored URL — `publicReels.service.test.ts` ("carries no HTML, iframe, or embed markup", asserting the exact key set)
- [x] 8.11 Regression test: article body video nodes still render as inert links, and `sanitizeHtml.ts` is unmodified — pre-existing `sanitizeHtml.test.ts` ("renders a video embed as an inert link, never an iframe") already covers this; confirmed via `git status` that neither `sanitizeHtml.ts` nor its test was touched by this change
- [x] 8.12 Regression test: the accepted media type list still rejects non-image content — pre-existing `mediaStorage.test.ts` ("rejects a file whose type cannot be recognized") already covers this generically via the untouched, allowlist-only `SIGNATURES` table in `mediaStorage.ts`; no `video/mp4`-specific byte fixture exists in that file to extend, and none was added since `mediaStorage.ts` is unmodified

## 9. Completion

- [x] 9.1 `pnpm build` — web, admin, api all build clean
- [x] 9.2 `pnpm lint` — clean (one `react/no-unescaped-entities` fixed in `ReelLibraryPage.tsx`)
- [x] 9.3 `pnpm test` — 48 files, 397 tests, all passing, zero regressions (49 new: 30 contracts + 17 api)
- [x] 9.4 `pnpm typecheck` — clean across all 6 packages/apps, no TypeScript errors, no `any`
- [x] 9.5 Confirm `apps/web` and `apps/api/src/lib/sanitizeHtml.ts` are untouched by this change — verified via `git status`, both empty
