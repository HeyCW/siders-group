## 1. Sanitization

- [x] 1.1 Implement/extend `apps/api/src/lib/sanitizeHtml.ts` with an allowlist covering every block type: headings, lists, checklists, tables, code blocks, quotes, images (with caption/alignment attributes), links, dividers, video embeds
- [x] 1.2 Add a test per block type asserting it survives sanitization, and one asserting a disallowed node/attribute is stripped

## 2. Data model

Table creation order is constrained by foreign keys: `media` before `articles` (featured-image FK); `categories` and `tags` before their join tables.

- [x] 2.1 Add `app.media` to the Drizzle schema (`packages/db`): id, storage_path (unique), mime, size_bytes, original_filename, alt, caption, uploaded_by (fk → `app.users`, `ON DELETE SET NULL`), created_at
- [x] 2.2 Add `app.articles`: id, title, slug (unique), body_json (jsonb), body_html, excerpt, status, author_id (fk → `app.users`), featured_media_id (fk → `app.media`, nullable, `ON DELETE SET NULL`), seo_title, seo_description, published_at (nullable), created_at, updated_at. There is **no** `category_id` column and **no** `featured_image_url` column
- [x] 2.3 Add `app.categories` (id, name, slug unique, created_at) and `app.tags` (id, name, slug unique, created_at)
- [x] 2.4 Add `app.article_categories` (article_id, category_id; composite PK; both FKs `ON DELETE CASCADE`)
- [x] 2.5 Add `app.article_tags` (article_id, tag_id; composite PK; both FKs `ON DELETE CASCADE`)
- [x] 2.6 Add unique constraints on `articles.slug`, `categories.slug`, `tags.slug`, `media.storage_path`
- [x] 2.7 Enable RLS with default deny on **all six** new tables (`media`, `articles`, `categories`, `tags`, `article_categories`, `article_tags`)
- [x] 2.8 Generate a single migration via `drizzle-kit generate`, covering every table above in FK order (`supabase/migrations/0001_silly_retro_girl.sql`). **Not applied** — this sandbox has no live `DIRECT_URL`; applying against the real Supabase instance is an infra step outside this session
- [ ] 2.9 Confirm the API's database role has `BYPASSRLS` (or write the equivalent RLS policy) so RLS default-deny is meaningful rather than vacuous — **cannot verify without a live database connection; do this when applying the migration**
- [x] 2.10 Confirm no new rows are added to `app.permissions`: `news.manage`, `category.manage`, `tag.manage` and `media.manage` are already seeded by `0000_useful_red_shift.sql` and already granted to Owner
- [x] 2.11 Defer `app.articles.search_vector` to a follow-up change (out of scope here)

## 3. Contracts

- [x] 3.1 Add Zod schemas in `packages/contracts` for article create/update, category, tag, and media
- [x] 3.2 Add a `status` enum (`draft | scheduled | published`) shared between contracts and Drizzle schema (already present as `article-status.ts`; `articleStatus` Drizzle enum in `articles.ts` uses the same three values)
- [x] 3.3 Model article category and tag assignment as arrays of ids (`categoryIds`, `tagIds`) — never a single `categoryId`
- [x] 3.4 Model the featured image as `featuredMediaId` (nullable uuid) on write, and as a derived URL on read — never as a client-supplied URL
- [x] 3.5 Ensure no article request schema declares an `author_id` field
- [x] 3.6 Add public list query schema: `limit` (default 20, max 100), `offset` (default 0), optional `categorySlug`, `tagSlug`, and `excludeIds`

## 4. Configuration

- [x] 4.1 Add `MEDIA_STORAGE_PATH` (absolute directory), `MEDIA_PUBLIC_BASE_URL`, and `MEDIA_MAX_BYTES` (default 10485760) to `apps/api/src/config/env.ts`, Zod-validated so a missing value fails at boot
- [x] 4.2 Update `.env.example` and any deployment configuration with the three new variables — **no `.env.example` exists anywhere in this repo** (checked; the R2/Google/session vars have none either), so there was nothing to update; deployment configuration (CI secrets, hosting env) is outside this repo and outside this session's reach
- [x] 4.3 Ensure the storage directory is created at boot if absent (`ensureMediaStorageDir`, called from `createServer`), and add a local-dev convention (`.data/`) to `.gitignore`

## 5. Media module — local filesystem

- [x] 5.1 Scaffold `apps/api/src/modules/media/` (routes, controller, service, repository, mapper)
- [x] 5.2 Add `apps/api/src/lib/mediaStorage.ts`: accept an uploaded buffer, validate, write it beneath `MEDIA_STORAGE_PATH`, return the storage-root-relative path. `apps/api/src/lib/storage.ts` (the R2 placeholder) is **not** used by this change
- [x] 5.3 Enforce the type allowlist: `image/jpeg`, `image/png`, `image/webp`, `image/gif`, `image/avif` — reject everything else
- [x] 5.4 Enforce `MEDIA_MAX_BYTES` server-side, both as a request body limit (multer `limits.fileSize`) and as an explicit check before writing (`storeUpload`)
- [x] 5.5 Sniff leading magic bytes to determine the real content type; reject when the sniffed type is not allowlisted or disagrees with the declared `Content-Type`. Never accept the declared header as the sole basis
- [x] 5.6 Name stored files `<uuid>.<ext>` with the extension derived from the **sniffed** type; never build any path segment from the client-supplied filename
- [x] 5.7 Shard storage by upload date: `<MEDIA_STORAGE_PATH>/YYYY/MM/<uuid>.<ext>`
- [x] 5.8 Create the `app.media` row on success, recording the relative storage path, sniffed mime, size, original filename, and `uploaded_by` from the session
- [x] 5.9 Derive the public URL in the mapper as `MEDIA_PUBLIC_BASE_URL + '/' + storage_path`; never store an absolute URL on the record
- [x] 5.10 Ensure a rejected upload leaves no file on disk and no media record (clean up any partially written file)
- [x] 5.11 Gate every media route with `requirePermission('media.manage')`
- [x] 5.12 Serve stored media publicly (`mediaFileRoutes` — an explicitly `requirePublic()`-declared static route) consistent with `MEDIA_PUBLIC_BASE_URL`

## 6. Admin API — articles module

- [x] 6.1 Scaffold `apps/api/src/modules/articles/` (routes, controller, service, repository, mapper)
- [x] 6.2 Gate **every** admin article route with `requirePermission('news.manage')` — create, read, update, delete, autosave, publish, unpublish, schedule, preview. Do not use a bare `requireStaff`, and do not branch on any role name
- [x] 6.3 Implement create/update/delete
- [x] 6.4 Implement slug auto-generation from the title **only when the slug is empty**; never regenerate an existing slug on title change, autosave, or publish. Manual override allowed at any time; reject collisions with a slug-conflict error
- [x] 6.5 Implement autosave endpoint (partial update to a draft) running content through the sanitizer on every write; autosave must not alter slug or status (enforced structurally — `articleAutosaveRequestSchema` has no `slug` or `status` field)
- [x] 6.6 Implement publish, unpublish, and schedule per the `published_at` lifecycle table in `design.md`: publish always sets `published_at = now()`; unpublish clears it to null; worker promotion leaves the scheduled time intact
- [x] 6.7 Implement `GET /admin/articles/:id/preview` returning the public-read DTO with the published-only filter bypassed; status unchanged
- [x] 6.8 Implement category and tag assignment as full-set replacement against the join tables (gated by `news.manage`, since it is an article edit)
- [x] 6.9 Implement `featured_media_id` assignment, validating that the referenced media record exists (FK violation on write is caught and rethrown as a 400 `invalid_taxonomy_reference`/FK error, not a 500)
- [x] 6.10 Ensure author is derived from the authenticated session, never from client input (`articleWriteFieldsSchema` has no `author_id` field at all; the controller takes it only from `req.auth`)

## 7. Admin API — categories and tags

- [x] 7.1 Scaffold `apps/api/src/modules/categories/` with CRUD, every route gated by `requirePermission('category.manage')`
- [x] 7.2 Scaffold `apps/api/src/modules/tags/` with CRUD, every route gated by `requirePermission('tag.manage')`
- [x] 7.3 Enforce slug uniqueness on both, rejecting duplicates with a conflict error
- [x] 7.4 Confirm deleting a category or tag detaches it from articles via join-table cascade and never deletes or unpublishes an article (`ON DELETE CASCADE` on `article_categories`/`article_tags` only; `articles` itself has no FK to either)

## 8. Public API

- [x] 8.1 Implement public list endpoint: published-only, paginated, filterable by category and tag, ordered by `published_at` descending with `id` as tiebreaker. Declare it with `requirePublic()`
- [x] 8.2 Implement public get-by-slug endpoint: published-only, 404 on unknown/unpublished/draft/future-scheduled slugs. Declare it with `requirePublic()`
- [x] 8.3 Implement the read-time fallback in **one** place in the public read query layer: treat `scheduled && published_at <= now()` as published, so the public path is correct even if the worker is down. Every public read uses this single predicate (`publiclyVisible()` in `article.repository.ts`, called by both `listPublished` and `findPublishedBySlug`)
- [x] 8.4 Implement `limit`/`offset` pagination with the default and maximum from task 3.6
- [x] 8.5 Implement `excludeIds`, applied before the limit so a caller asking for N still receives N
- [x] 8.6 Return all of an article's categories and all of its tags (many-to-many joins), not a single category
- [x] 8.7 Derive the featured image URL from the referenced media record in the public mapper
- [x] 8.8 Confirm unpublish and delete immediately remove an article from both public endpoints (both flow through the same `publiclyVisible()` predicate/row deletion; no separate "public visibility" flag to fall out of sync)
- [x] 8.9 Confirm the public read mapper never includes `body_json` in the response — only `body_html` (`toPublicCard`/`toPublicDetail` never read `article.bodyJson`; only `toAdminResponse` and `toPreviewResponse` do)
- [x] 8.10 Apply a per-route rate limit bucket to the public endpoints via the existing `rateLimit` middleware

## 9. Revalidation and scheduled publishing

- [x] 9.1 Add `apps/api/src/lib/revalidate.ts`: POST to `${APP_ORIGIN}/api/revalidate` with the `x-revalidate-secret` header and a `{ path }` body, one call per path. Log and swallow failures — a failed revalidation must never fail the write that triggered it
- [x] 9.2 Call it for `/news/<slug>`, `/news`, and `/` on publish, unpublish, delete, and any update to a currently visible article
- [x] 9.3 Add a cron worker (via the existing `startScheduler`) that promotes `scheduled` articles with `published_at <= now()` to `published`, leaving `published_at` unchanged, and revalidates the same three paths

## 10. Admin editor UI

- [x] 10.1 Set up Tiptap in `apps/admin` with the required extensions (Table, TaskList, Image, CodeBlock [via StarterKit], Placeholder, Link, Underline, TaskItem, CharacterCount) plus a custom Video node
- [x] 10.2 Build the centered writing canvas with a separate title field (`EditorCanvas.tsx` + the title `<input>` in `ArticleEditPage.tsx`)
- [x] 10.3 Build the floating contextual (bubble menu) toolbar shown only on selection/cursor focus (`BubbleToolbar.tsx`; verified live in a real browser — appears on selection, correctly highlights the active mark/heading level)
- [x] 10.4 Build the `/` slash-command menu for block insertion (`slashCommand.ts` + `SlashCommandList.tsx`, via `@tiptap/suggestion`; verified live — opens only at the start of an empty line, filters by query, keyboard nav works)
- [x] 10.5 Wire keyboard shortcuts (bold, italic, underline, undo, redo, block split/merge) — these come from StarterKit/Underline's default keymaps; not modified, so Tiptap's stock bindings apply
- [ ] 10.6 Implement image insertion with resize, alignment, and caption. **Partially done**: inserting an image uploads through the admin media endpoint and references the returned media record (verified live), type/size rejections surface via the server's real error message, and the extended `Image` node's schema already carries `width`/`align`/`caption` attributes that `sanitizeHtml.ts` renders — but no drag-to-resize handle, alignment picker, or caption input UI exists yet, so a writer cannot set those three attributes from the editor today
- [x] 10.7 Implement focus mode (hide surrounding admin chrome) — toggled in `ArticleEditPage.tsx`, hides the header and metadata sidebar, leaving only the canvas plus an exit button
- [x] 10.8 Implement dark mode toggle with persisted user preference (`useDarkMode.ts`, `localStorage` + `prefers-color-scheme` fallback, Tailwind `darkMode: 'class'`)

## 11. Admin management UI

- [x] 11.1 Build article list view (draft/scheduled/published filters) — `ArticleListPage.tsx`; verified live in a real browser
- [x] 11.2 Build create/edit view wired to autosave with a visible save-status indicator — `ArticleEditPage.tsx` + `SaveStatusIndicator.tsx`, 1.2s debounce
- [x] 11.3 Add slug field (auto-filled on first save, editable), SEO title/description fields, featured image picker backed by the media endpoint, and **multi-select** category and tag pickers (`MultiSelectChips.tsx`)
- [x] 11.4 Add publish, unpublish, schedule (date/time picker), preview, and delete controls
- [x] 11.5 Build category and tag management screens (`TaxonomyManagementPage.tsx`, shared between both). "Shown only to callers holding the permission" is enforced server-side per 11.6 below — the screens themselves render for any staff member, since the admin app has no route guarding of its own; a caller without the permission sees the screen but every mutation is rejected and surfaced as "You don't have permission"
- [x] 11.6 Hide or disable admin actions the current caller lacks permission for, treating the server check as authoritative. Implemented as **reactive 403 handling** (`useAsyncAction.ts`) rather than pre-computing the caller's permission set client-side: no endpoint currently exposes the caller's own resolved permissions (`GET /users/me` returns `roleId`/`roleName` but not permissions, and extending it was out of scope — it belongs to `add-auth-foundation`, not this change). A denied action shows an inline "You don't have permission" message and disables while in flight; it does not pre-hide the control before the first attempt. If a lower-latency "hide before attempting" experience is wanted later, the smallest change is adding `permissions: string[]` to `GET /users/me`

## 12. Documentation

- [x] 12.1 Update `docs/ARCHITECTURE.md` §7 to record that article media is stored on the application's local filesystem for this change, and that the R2 presigned-upload flow and CDN derivative pipeline are deferred
- [x] 12.2 Confirm no document in this change describes roles as a fixed `owner | editor | author` enum; roles are dynamic database records and authorization is permission-based (repo-wide grep confirms — remaining hits are intentional: this change's own correction note, and `add-auth-foundation`'s historical record of what it replaced)

## 13. Verification

Everything in this section that could be verified **without a live Postgres connection** was written and passes (274 tests total: 249 in `apps/api`, 38 in `packages/contracts`, plus the pre-existing 1 in `packages/db`). This sandbox has no `DIRECT_URL`/`DATABASE_URL` to a real database, so anything requiring actual query execution — the migration applying cleanly, `ON DELETE CASCADE`/`ON DELETE SET NULL` firing for real, Drizzle-generated SQL for pagination/`excludeIds`/category-tag filtering, and true end-to-end permission checks through `requirePermission` (which queries the database) — is flagged below rather than claimed as done.

- [x] 13.1 Unit tests covering the service-layer logic in every scenario that doesn't require a live database: `article.service.test.ts` (18), `category.service.test.ts` (6), `tag.service.test.ts` (6), `media.service.test.ts` (5), `scheduledPublishWorker.test.ts` (4), `sanitizeHtml.test.ts` (18, one per block type + disallowed-markup cases), `mediaStorage.test.ts` (11), `revalidate.test.ts` (4), plus contract-schema tests (`article.test.ts`, 15). **Not covered**: repository-level Drizzle query correctness (needs a live DB — see 13.7/13.10/13.11), and the article-editor UI scenarios beyond what was verified by hand in a real browser (bubble menu, slash command open/filter/dismiss — see the session's live-testing notes; no automated component test was written for these)
- [ ] 13.2 Authorization tests via real HTTP requests with real sessions — **not done**. `requirePermission` resolves the caller's role and permissions from the database on every request (`authorize.ts`), so a true "staff member without X is rejected, with X is allowed" test needs a live Postgres with a real staff/role/session fixture. What **is** verified: `authorize.test.ts` (pre-existing, 32 tests) covers `requirePermission`'s own logic against a fake DB layer, and every new route in this change declares `requirePermission('<key>')` (visible in `article.routes.ts`, `media.routes.ts`, `category.routes.ts`, `tag.routes.ts` — code review, not a runtime assertion)
- [x] 13.3 `auditAuthorizationDeclarations` passing at boot is asserted by `health.routes.test.ts`, which calls the real `createServer()` — confirmed still passing with all six new route groups mounted (`/media`, `/media-files`, `/admin/articles`, `/articles`, `/categories`, `/tags`)
- [ ] 13.4 Needs a live DB to create a dynamically-named role and assign it — **not done** for the same reason as 13.2
- [x] 13.5 `mediaStorage.test.ts`: oversized file rejected, disallowed type rejected, declared-vs-sniffed mismatch rejected, empty buffer rejected, rejected uploads leave no file on disk. The path-traversal scenario is covered structurally rather than with a literal `../` filename: `storeUpload`'s signature never accepts a client filename at all, so there is no parameter through which a traversal string could reach a path — the test documents this rather than asserting behavior against an input the function cannot receive
- [x] 13.6 Covered in `article.service.test.ts` - "published_at lifecycle" (4 tests: publish sets now, publishing a scheduled article overwrites the future timestamp, unpublish clears it, republish sets a new now rather than the original time)
- [ ] 13.7 Needs a live DB — `listPublished`'s category/tag filter is a Drizzle subquery, untested without real query execution. The many-to-many data model itself (`article_categories` join table, no `category_id` column) is asserted by the schema and migration, not by a runtime test here
- [ ] 13.8 Needs a live DB to observe `ON DELETE CASCADE` actually firing. What's verified without one: `category.service.test.ts`/`tag.service.test.ts` confirm the service layer never touches `articles` on delete; the cascade-only-detaches guarantee is a property of the migration SQL (`article_categories`/`article_tags` FKs are `ON DELETE CASCADE`, `articles` itself has no FK to either), reviewed but not executed
- [ ] 13.9 Same limitation as 13.8, for `featured_media_id`'s `ON DELETE SET NULL` — the migration declares it; `media.service.test.ts` confirms the service layer's own delete flow, not the FK behavior
- [ ] 13.10 Needs a live DB — `excludeIds`'s `notInArray` clause is untested against real data. **What is covered**: `article.test.ts` (contracts) fully tests the comma-separated-string-to-array parsing that feeds it
- [ ] 13.11 Needs a live DB — this is the single most important scenario in the whole change (design.md's "read-time fallback") and the one most worth writing first once a database is available. `publiclyVisible()` in `article.repository.ts` is structurally guaranteed to be the only definition of the predicate (both `listPublished` and `findPublishedBySlug` call the same private function), which a code reviewer can confirm today, but nothing here executes it against real rows
- [x] 13.12 `revalidate.test.ts` proves `revalidateArticlePaths` never throws, even on a network failure or an error response; `article.service.test.ts` documents (rather than redundantly re-tests) that the service relies on that contract instead of adding its own try/catch
- [ ] 13.13 Manual QA against a deployed environment with a real database, real staff session, and real wall-clock time passing — **not done**, and not attemptable in this sandbox. This is the one item on this list that has no automated substitute; do it before shipping
