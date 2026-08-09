## 1. Sanitization

- [ ] 1.1 Implement/extend `apps/api/src/lib/sanitizeHtml.ts` with an allowlist covering every block type: headings, lists, checklists, tables, code blocks, quotes, images (with caption/alignment attributes), links, dividers, video embeds
- [ ] 1.2 Add a test per block type asserting it survives sanitization, and one asserting a disallowed node/attribute is stripped

## 2. Data model

Table creation order is constrained by foreign keys: `media` before `articles` (featured-image FK); `categories` and `tags` before their join tables.

- [ ] 2.1 Add `app.media` to the Drizzle schema (`packages/db`): id, storage_path (unique), mime, size_bytes, original_filename, alt, caption, uploaded_by (fk → `app.users`, `ON DELETE SET NULL`), created_at
- [ ] 2.2 Add `app.articles`: id, title, slug (unique), body_json (jsonb), body_html, excerpt, status, author_id (fk → `app.users`), featured_media_id (fk → `app.media`, nullable, `ON DELETE SET NULL`), seo_title, seo_description, published_at (nullable), created_at, updated_at. There is **no** `category_id` column and **no** `featured_image_url` column
- [ ] 2.3 Add `app.categories` (id, name, slug unique, created_at) and `app.tags` (id, name, slug unique, created_at)
- [ ] 2.4 Add `app.article_categories` (article_id, category_id; composite PK; both FKs `ON DELETE CASCADE`)
- [ ] 2.5 Add `app.article_tags` (article_id, tag_id; composite PK; both FKs `ON DELETE CASCADE`)
- [ ] 2.6 Add unique constraints on `articles.slug`, `categories.slug`, `tags.slug`, `media.storage_path`
- [ ] 2.7 Enable RLS with default deny on **all six** new tables (`media`, `articles`, `categories`, `tags`, `article_categories`, `article_tags`)
- [ ] 2.8 Generate and apply a single migration via `drizzle-kit` against `DIRECT_URL`, covering every table above in FK order
- [ ] 2.9 Confirm the API's database role has `BYPASSRLS` (or write the equivalent RLS policy) so RLS default-deny is meaningful rather than vacuous
- [ ] 2.10 Confirm no new rows are added to `app.permissions`: `news.manage`, `category.manage`, `tag.manage` and `media.manage` are already seeded by `0000_useful_red_shift.sql` and already granted to Owner
- [ ] 2.11 Defer `app.articles.search_vector` to a follow-up change (out of scope here)

## 3. Contracts

- [ ] 3.1 Add Zod schemas in `packages/contracts` for article create/update, category, tag, and media
- [ ] 3.2 Add a `status` enum (`draft | scheduled | published`) shared between contracts and Drizzle schema
- [ ] 3.3 Model article category and tag assignment as arrays of ids (`categoryIds`, `tagIds`) — never a single `categoryId`
- [ ] 3.4 Model the featured image as `featuredMediaId` (nullable uuid) on write, and as a derived URL on read — never as a client-supplied URL
- [ ] 3.5 Ensure no article request schema declares an `author_id` field
- [ ] 3.6 Add public list query schema: `limit` (default 20, max 100), `offset` (default 0), optional `categorySlug`, `tagSlug`, and `excludeIds`

## 4. Configuration

- [ ] 4.1 Add `MEDIA_STORAGE_PATH` (absolute directory), `MEDIA_PUBLIC_BASE_URL`, and `MEDIA_MAX_BYTES` (default 10485760) to `apps/api/src/config/env.ts`, Zod-validated so a missing value fails at boot
- [ ] 4.2 Update `.env.example` and any deployment configuration with the three new variables
- [ ] 4.3 Ensure the storage directory is created at boot if absent, and that it is excluded from version control

## 5. Media module — local filesystem

- [ ] 5.1 Scaffold `apps/api/src/modules/media/` (routes, controller, service, repository, mapper)
- [ ] 5.2 Add `apps/api/src/lib/mediaStorage.ts`: accept an uploaded buffer, validate, write it beneath `MEDIA_STORAGE_PATH`, return the storage-root-relative path. `apps/api/src/lib/storage.ts` (the R2 placeholder) is **not** used by this change
- [ ] 5.3 Enforce the type allowlist: `image/jpeg`, `image/png`, `image/webp`, `image/gif`, `image/avif` — reject everything else
- [ ] 5.4 Enforce `MEDIA_MAX_BYTES` server-side, both as a request body limit and as an explicit check before writing
- [ ] 5.5 Sniff leading magic bytes to determine the real content type; reject when the sniffed type is not allowlisted or disagrees with the declared `Content-Type`. Never accept the declared header as the sole basis
- [ ] 5.6 Name stored files `<uuid>.<ext>` with the extension derived from the **sniffed** type; never build any path segment from the client-supplied filename
- [ ] 5.7 Shard storage by upload date: `<MEDIA_STORAGE_PATH>/YYYY/MM/<uuid>.<ext>`
- [ ] 5.8 Create the `app.media` row on success, recording the relative storage path, sniffed mime, size, original filename, and `uploaded_by` from the session
- [ ] 5.9 Derive the public URL in the mapper as `MEDIA_PUBLIC_BASE_URL + '/' + storage_path`; never store an absolute URL on the record
- [ ] 5.10 Ensure a rejected upload leaves no file on disk and no media record (clean up any partially written file)
- [ ] 5.11 Gate every media route with `requirePermission('media.manage')`
- [ ] 5.12 Serve stored media publicly (static route or reverse proxy) consistent with `MEDIA_PUBLIC_BASE_URL`

## 6. Admin API — articles module

- [ ] 6.1 Scaffold `apps/api/src/modules/articles/` (routes, controller, service, repository, mapper)
- [ ] 6.2 Gate **every** admin article route with `requirePermission('news.manage')` — create, read, update, delete, autosave, publish, unpublish, schedule, preview. Do not use a bare `requireStaff`, and do not branch on any role name
- [ ] 6.3 Implement create/update/delete
- [ ] 6.4 Implement slug auto-generation from the title **only when the slug is empty**; never regenerate an existing slug on title change, autosave, or publish. Manual override allowed at any time; reject collisions with a slug-conflict error
- [ ] 6.5 Implement autosave endpoint (partial update to a draft) running content through the sanitizer on every write; autosave must not alter slug or status
- [ ] 6.6 Implement publish, unpublish, and schedule per the `published_at` lifecycle table in `design.md`: publish always sets `published_at = now()`; unpublish clears it to null; worker promotion leaves the scheduled time intact
- [ ] 6.7 Implement `GET /admin/articles/:id/preview` returning the public-read DTO with the published-only filter bypassed; status unchanged
- [ ] 6.8 Implement category and tag assignment as full-set replacement against the join tables (gated by `news.manage`, since it is an article edit)
- [ ] 6.9 Implement `featured_media_id` assignment, validating that the referenced media record exists
- [ ] 6.10 Ensure author is derived from the authenticated session, never from client input

## 7. Admin API — categories and tags

- [ ] 7.1 Scaffold `apps/api/src/modules/categories/` with CRUD, every route gated by `requirePermission('category.manage')`
- [ ] 7.2 Scaffold `apps/api/src/modules/tags/` with CRUD, every route gated by `requirePermission('tag.manage')`
- [ ] 7.3 Enforce slug uniqueness on both, rejecting duplicates with a conflict error
- [ ] 7.4 Confirm deleting a category or tag detaches it from articles via join-table cascade and never deletes or unpublishes an article

## 8. Public API

- [ ] 8.1 Implement public list endpoint: published-only, paginated, filterable by category and tag, ordered by `published_at` descending with `id` as tiebreaker. Declare it with `requirePublic()`
- [ ] 8.2 Implement public get-by-slug endpoint: published-only, 404 on unknown/unpublished/draft/future-scheduled slugs. Declare it with `requirePublic()`
- [ ] 8.3 Implement the read-time fallback in **one** place in the public read query layer: treat `scheduled && published_at <= now()` as published, so the public path is correct even if the worker is down. Every public read uses this single predicate
- [ ] 8.4 Implement `limit`/`offset` pagination with the default and maximum from task 3.6
- [ ] 8.5 Implement `excludeIds`, applied before the limit so a caller asking for N still receives N
- [ ] 8.6 Return all of an article's categories and all of its tags (many-to-many joins), not a single category
- [ ] 8.7 Derive the featured image URL from the referenced media record in the public mapper
- [ ] 8.8 Confirm unpublish and delete immediately remove an article from both public endpoints
- [ ] 8.9 Confirm the public read mapper never includes `body_json` in the response — only `body_html`
- [ ] 8.10 Apply a per-route rate limit bucket to the public endpoints via the existing `rateLimit` middleware

## 9. Revalidation and scheduled publishing

- [ ] 9.1 Add `apps/api/src/lib/revalidate.ts`: POST to `${APP_ORIGIN}/api/revalidate` with the `x-revalidate-secret` header and a `{ path }` body, one call per path. Log and swallow failures — a failed revalidation must never fail the write that triggered it
- [ ] 9.2 Call it for `/news/<slug>`, `/news`, and `/` on publish, unpublish, delete, and any update to a currently visible article
- [ ] 9.3 Add a cron worker (via the existing `startScheduler`) that promotes `scheduled` articles with `published_at <= now()` to `published`, leaving `published_at` unchanged, and revalidates the same three paths

## 10. Admin editor UI

- [ ] 10.1 Set up Tiptap in `apps/admin` with the required extensions (Table, TaskList, Image, CodeBlock, Placeholder, Link, etc.)
- [ ] 10.2 Build the centered writing canvas with a separate title field
- [ ] 10.3 Build the floating contextual (bubble menu) toolbar shown only on selection/cursor focus
- [ ] 10.4 Build the `/` slash-command menu for block insertion
- [ ] 10.5 Wire keyboard shortcuts (bold, italic, underline, undo, redo, block split/merge)
- [ ] 10.6 Implement image insertion with resize, alignment, and caption, uploading through the admin media endpoint and referencing the returned media record; surface type/size rejections to the user
- [ ] 10.7 Implement focus mode (hide surrounding admin chrome)
- [ ] 10.8 Implement dark mode toggle with persisted user preference

## 11. Admin management UI

- [ ] 11.1 Build article list view (draft/scheduled/published filters)
- [ ] 11.2 Build create/edit view wired to autosave with a visible save-status indicator
- [ ] 11.3 Add slug field (auto-filled on first save, editable), SEO title/description fields, featured image picker backed by the media endpoint, and **multi-select** category and tag pickers
- [ ] 11.4 Add publish, unpublish, schedule (date/time picker), preview, and delete controls
- [ ] 11.5 Build category and tag management screens, shown only to callers holding `category.manage` / `tag.manage` respectively
- [ ] 11.6 Hide or disable admin actions the current caller lacks permission for, treating the server check as authoritative

## 12. Documentation

- [ ] 12.1 Update `docs/ARCHITECTURE.md` §7 to record that article media is stored on the application's local filesystem for this change, and that the R2 presigned-upload flow and CDN derivative pipeline are deferred
- [ ] 12.2 Confirm no document in this change describes roles as a fixed `owner | editor | author` enum; roles are dynamic database records and authorization is permission-based

## 13. Verification

- [ ] 13.1 Unit/integration tests covering each scenario in `specs/article-editor/spec.md`, `specs/article-management/spec.md`, `specs/category-management/spec.md`, `specs/tag-management/spec.md`, `specs/media-management/spec.md`, and `specs/public-news-api/spec.md`
- [ ] 13.2 Authorization tests: for each of `news.manage`, `category.manage`, `tag.manage`, `media.manage`, assert a staff member **without** it is rejected and one **with** it is allowed; assert Owner passes every one
- [ ] 13.3 Assert `auditAuthorizationDeclarations` still passes at boot with all new routes registered
- [ ] 13.4 Test that a role granting `news.manage` works regardless of its name, confirming no role-name branching
- [ ] 13.5 Media tests: oversized file rejected; disallowed type rejected; a file declared `image/png` whose magic bytes say otherwise rejected; a filename containing `../` stored safely under the storage root; rejected uploads leave no file and no row
- [ ] 13.6 Test that publishing a `scheduled` article with a future `published_at` results in `published_at = now()`, and that unpublishing clears `published_at` to null
- [ ] 13.7 Test that an article can carry two or more categories and that filtering by one of them returns it
- [ ] 13.8 Test that deleting a category or tag leaves its articles published and retrievable
- [ ] 13.9 Test that deleting a media record clears `featured_media_id` on referencing articles without deleting them
- [ ] 13.10 Test `excludeIds`: excluded articles are absent, and a request for N still returns N when enough other articles exist
- [ ] 13.11 Add a public-read integration test asserting a `scheduled` article with `published_at <= now()` is returned by the public list and by-slug endpoints even if the worker has not yet flipped the stored status
- [ ] 13.12 Test that a failed revalidation call does not fail the publish that triggered it
- [ ] 13.13 Manual QA pass: draft → autosave → schedule → scheduled time passes → confirm public visibility without manual intervention → unpublish → confirm removal and cleared `published_at`
