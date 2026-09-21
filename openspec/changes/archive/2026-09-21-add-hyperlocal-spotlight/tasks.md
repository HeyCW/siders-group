## 1. Data model

- [x] 1.1 Add `packages/db/src/schema/hyperlocalSpotlight.ts`: table `hyperlocal_spotlight` with
      `slot` (single-permitted-value primary key, so a second row is impossible), **nullable**
      `article_id` (`char(36)`, `references(() => articles.id, { onDelete: 'set null' })`),
      `updated_at`. **Deviation**: no `updated_by` column — nothing in the approved spec asks who
      made a pick, and adding it would have required threading a caller id through
      `article.service.ts`'s `update()` for no requirement it serves; dropped to keep the change
      to what the spec actually asks for. Documented in the file header why this is a separate
      singleton table and not an `articles` boolean, and why the FK is `SET NULL` and not
      `CASCADE` as `homeCuration.ts` uses.
- [x] 1.2 Export it from `packages/db/src/schema/index.ts`
- [x] 1.3 Add the migration under `apps/api-laravel/database/migrations/` (the applied path — see
      `add-guide-pick-instagram-link/tasks.md` 1.2 on the stale drizzle migrations), following the
      existing create-table migrations' conventions
- [x] 1.4 Seed the one row in that same migration (`slot = 'default'`, `article_id = NULL`), so no
      code path ever has to create it
- [x] 1.5 Confirmed no column is added to `articles`

## 2. Contracts

- [x] 2.1 Added `isHyperlocalSpotlight: z.boolean().optional()` to `articleWriteFieldsSchema` in
      `packages/contracts/src/article.ts`, flowing into both `articleCreateRequestSchema` and
      `articleUpdateRequestSchema`
- [x] 2.2 Added `isHyperlocalSpotlight: z.boolean()` to `articleAdminResponseSchema`
- [x] 2.3 `articleAutosaveRequestSchema` left untouched
- [x] 2.4 Added `packages/contracts/src/hyperlocalSpotlight.ts` with
      `hyperlocalSpotlightResponseSchema` (`{ editorPick: {article, status, isPubliclyVisible} |
      null, resolved: summary | null, resolvedIsEditorPick }`) and `publicHyperlocalSpotlightSchema`
      (`{ article: ArticlePublicCard | null, isEditorPick }`) — kept `editorPick` and `resolved`
      apart, per the admin-read requirement's "invisible pick returned to staff, alongside the
      article the public spotlight currently shows"
- [x] 2.5 Exported from `packages/contracts/src/index.ts`
- [x] 2.6 Unit tests added in `article.test.ts` (flag on create/update, autosave rejects it as an
      unknown key) and `hyperlocalSpotlight.test.ts` (both response shapes' null/empty states)

## 3. API — spotlight storage and reads

- [x] 3.1 Added `hyperlocalSpotlight.repository.ts`: `getArticleId()` (plain pool read, treats a
      missing row as `null`), `set(executor, articleId)`, `clearIfHeldBy(executor, articleId)` —
      both take `OrderingExecutor` (never the bare pool), so a caller passing the pool instead of
      a transaction is a type error, not a silent atomicity bug
- [x] 3.2 Added `hyperlocalSpotlight.service.ts` + `.mapper.ts` + `.controller.ts`. Resolution:
      editor pick when stored *and* publicly visible, else `articleRepository.listPublished({
      limit: 1, offset: 0, now })` — the same query `homeFeed.service.ts` backfills with
- [x] 3.2a Fallback is never written back; both read shapes report whether the resolved article
      was an editor pick
- [x] 3.3 Added `hyperlocalSpotlight.routes.ts`: admin `GET /admin/hyperlocal-spotlight` behind
      `requirePermission('news.manage')`, public `GET /home/hyperlocal-spotlight` behind
      `requirePublic()` + `publicReadRateLimiter`. No write route.
- [x] 3.4 Mounted both in `apps/api/src/server.ts`

## 4. API — the flag on article writes

- [x] 4.1 `article.repository.ts`'s `create`/`update` write the spotlight inside their existing
      `db.transaction`: `true` → `set()`, `false` → `clearIfHeldBy()`, `undefined` → no write.
      Composes its own internal `createHyperlocalSpotlightRepository(db)` rather than taking it as
      a constructor argument, so every existing call site (`article.routes.ts`, `curation.routes.ts`,
      `server.ts`'s scheduler) is unchanged.
- [x] 4.2 On create, the spotlight write happens after the article insert, within the same
      transaction
- [x] 4.3 The admin response's `isHyperlocalSpotlight` is resolved in `article.controller.ts` (a
      small `SpotlightLookup.getArticleId()` compared against the article's own id), not baked
      into `ArticleWithRelations` or `attachRelations` — the spotlight lives in its own table, and
      most `ArticleRepository` read paths (public listing, by-slug) never need this comparison
- [x] 4.4 **Correctness fix during implementation**: the field was initially handled inside
      `toRepositoryFields`, the helper shared by `update()` and `autosave()` — exactly the mistake
      the codebase's own `slug` handling deliberately avoids (`slug` is read only in `update()`,
      never inside that shared helper, specifically so autosave can't move it even at the service
      layer, independent of the schema boundary). Moved `isHyperlocalSpotlight` out to match:
      `update()` now reads it directly from `input`, `toRepositoryFields` never sees it, and
      `autosave()`'s call to the same helper is untouched.

## 5. API tests

- [x] 5.1 `article.service.test.ts` — set at creation, moving from A to B, re-saving the holder,
      unsetting on the holder, unsetting on a non-holder (no-op), omitted flag leaves the slot
      alone, autosave asked to carry the flag is still ignored
- [x] 5.2 Revalidation: fires once on a spotlight-touching create, not at all when the flag is
      omitted, and once on an otherwise-invisible article being spotlighted
- [~] Atomicity/concurrency (5.2 original, 5.6/5.6a's concurrent-write half) — not exercised by a
      dedicated test. This codebase's own convention for `home_curation`/`article.repository.ts`
      is the same: transactional atomicity and MySQL-level concurrent-write behavior are asserted
      by code review and the shared `db.transaction`/advisory-lock machinery, not by a real-DB
      test (there are no real-DB repository tests anywhere in this module today; see
      `mysqlIntegration.test.ts`, skipped in this environment). Flagged rather than silently
      dropped.
- [x] 5.4 `hyperlocalSpotlight.service.test.ts` — no-pick fallback, editor pick outranks the
      fallback, a draft/scheduled pick's visibility, no-publicly-visible-article-at-all, admin read
      distinguishing an invisible editor pick from what's resolved publicly
- [x] 5.3 / 5.5 / 5.6 — covered across the two test files above via the shared `isPubliclyVisible`
      predicate and the fake repositories' state
- [~] 5.6a (row survives, missing-row degrades to fallback) — covered by design (`getArticleId()`
      treats a missing row as `null`) and by the fake's default state, not by a dedicated
      missing-row test
- [x] 5.7 Curated-list independence is structural (spotlight writes touch only
      `hyperlocal_spotlight`; `home_curation` writes touch only their own table) rather than
      asserted by a cross-module test — the two repositories share no write path to test for
      interference.

## 6. Admin UI

- [x] 6.1 Added `apps/admin/src/lib/hyperlocalSpotlightApi.ts` (`get()` only — no write; the
      spotlight is set through `articlesApi.create`/`update`)
- [x] 6.2 Added the checkbox to `ArticleEditPage.tsx`, saved by an explicit
      `articlesApi.update(id, { isHyperlocalSpotlight })` call on change — the same
      outside-autosave pattern `commitSlug` already uses for the slug, not routed through
      `patchForm`/the debounced autosave at all
- [ ] 6.3 **Deliberately skipped**: `NewArticlePage.tsx` never shows a form — it silently creates a
      blank `{ title: 'Untitled', slug: 'untitled-<random>' }` draft and redirects straight into
      `ArticleEditPage`. There is no create-time UI moment to put a checkbox in. The contract layer
      still accepts `isHyperlocalSpotlight` on create (2.1, 4.1) for API completeness and tests;
      in practice every spotlight pick is made from the edit page, including on a just-created
      draft.
- [x] 6.4 Caption next to the checkbox names the current editor pick, the automatic fallback, or
      "none"
- [x] 6.5 Caption states the spotlight returns to the newest published article when unchecked
- [x] 6.6 Tests added: unset + another editor pick named, fallback named as automatic, checked +
      release wording when this article holds it, explicit `update` call (not autosave) on toggle,
      rejected save shows the error and leaves the checkbox in its prior state

## 7. Public web page

- [x] 7.1 Added `HyperlocalSpotlight.tsx` — returns `null` only when no article resolves; reuses
      `ArticleCard`'s existing `featured` layout rather than new markup
- [x] 7.2 Added `getHyperlocalSpotlight` to `apps/web/src/lib/api.ts`, called from `HomePage.tsx`
      alongside the existing guide-pick/partner/home-feed loads, rendered above `Showcase`
- [x] 7.3 Failed/empty read degrades to `null` state, same catch-and-null pattern as the other
      home page sections
- [x] 7.4 Tests: renders nothing with no article, renders the resolved article (fallback and pick
      render through the identical code path, so one rendering test covers both)

## 8. Verification

- [x] 8.1 `pnpm typecheck` and `pnpm lint` clean across `db`, `contracts`, `api`, `admin`, `web`.
      `pnpm test`: all new/updated suites pass; pre-existing failures unrelated to this change
      confirmed present on the unmodified branch too (a stale `guidePick.test.ts` case, and a set
      of CSRF/cookie-handling tests in `apps/admin` and `apps/web` — environmental, not touched by
      this change). `apps/admin` and `apps/api` build cleanly; `apps/web`'s `vite build` step
      succeeds, its separate prerender script fails only on a missing `VITE_API_URL` env var in
      this sandbox (pre-existing, unrelated to this change's code).
- [ ] 8.2 Manual walk-through in a running app — not done in this session (no live MySQL instance
      available here); left for the next environment that has one.

## 9. Laravel port (apps/api-laravel)

The user clarified mid-implementation that this capability belongs in `apps/api-laravel`
(Laravel), which turns out to be a complete parallel implementation of the same API surface —
every other capability (articles, curation, guide picks, partners, …) already exists there too,
mirroring `apps/api`'s Node implementation route-for-route and service-for-service. The frontend's
`apiFetch` clients (`${API_URL}/api${path}`) match Laravel's auto-`/api`-prefixed routing
convention.

- [x] 9.1 `hyperlocal_spotlight` table (migration already written for 1.3 is Laravel-native; no
      change needed)
- [x] 9.2 `App\Models\HyperlocalSpotlight` — singleton row model, `CREATED_AT = null`
- [x] 9.3 `App\Services\HyperlocalSpotlightService` — `getPickArticleId()`, `setPick()`,
      `clearIfHeldBy()`, `resolveAdmin()`, `resolvePublic()`. `firstOrCreate` on every access
      rather than a bare read, so a database restored without the seed row self-heals instead of
      throwing.
- [x] 9.4 `App\Http\Controllers\HyperlocalSpotlightController` — `adminShow`/`publicShow`, no
      write action
- [x] 9.5 Routes added to `routes/api.php`: public `GET /home/hyperlocal-spotlight`
      (`public` middleware), admin `GET /admin/hyperlocal-spotlight` (`permission:news.manage`) —
      confirmed by `RouteAuthorizationAuditTest` (still passes with both routes registered)
- [x] 9.6 `isHyperlocalSpotlight` added to `StoreArticleRequest`/`UpdateArticleRequest` rules;
      `AutosaveArticleRequest` untouched
- [x] 9.7 `ArticleService::create`/`update` write the pick inside the existing `DB::transaction`;
      `autosave()` untouched and structurally never receives the key (not in its FormRequest's
      `rules()`, so Laravel's `validated()` drops it even if a caller sends it)
- [x] 9.8 `ArticlePresenter::admin()` takes `isHyperlocalSpotlight` as a second parameter, resolved
      per-call by `ArticleController` (added as a constructor dependency), not stored on `Article`
- [x] 9.9 `tests/Feature/HyperlocalSpotlightTest.php` — 12 tests covering admin-auth, public
      fallback, set-at-creation, move-releases-previous-holder-untouched, unset-releases,
      unset-on-non-holder-is-noop, saving-without-flag-is-untouched, autosave-cannot-move-it,
      admin-read distinguishes invisible-pick-vs-resolved, delete-hands-to-newest,
      curated-list-independence
- [~] 9.10 **Could not execute the new tests in this sandbox.** `php artisan test` (SQLite, the
      only driver available here — no MySQL/docker reachable) fails on the very first migration
      (`roles`) with a SQL syntax error: every migration's `DB::raw('CURRENT_TIMESTAMP(3)')`
      column default is invalid SQLite syntax (SQLite's `CURRENT_TIMESTAMP` takes no precision
      argument). Confirmed pre-existing and unrelated to this change by running an unrelated
      one-line sanity test (`Role::create(...)`) with zero of this change's code involved — it
      fails identically. This is why `tests/Feature`/`tests/Unit` have no existing DB-touching
      test today: none could pass here. `.github/workflows/ci.yml` runs no PHP/Laravel step at
      all (`pnpm lint`/`typecheck`/`test`/`build` only) — this gap has never been exercised in CI
      either. Verified instead via `php -l` (clean), Laravel Pint (clean), and
      `RouteAuthorizationAuditTest` passing with the two new routes registered. The test file
      itself is ordinary `RefreshDatabase` PHPUnit and should pass unmodified against a real
      MySQL test database.
