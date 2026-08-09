## Why

`docs/ARCHITECTURE.md` already names an `articles` module, an `app.articles` table, and a Tiptap-based editor in `apps/admin`, but no behavior has been specified: editors have no defined workflow for drafting, previewing, scheduling, or publishing long-form content, and there is no contract for how published articles reach the public site. Without this, `apps/api/src/modules/articles` and the `apps/admin` editor have nothing concrete to build against.

`add-auth-foundation` also seeded four permission catalog rows written specifically for this work — `news.manage`, `category.manage`, `tag.manage`, `media.manage` — which no endpoint currently declares. This change wires them up.

## What Changes

- Add a distraction-free, Tiptap-based rich text editor to `apps/admin`: large centered canvas, floating contextual toolbar (Medium-style), `/` slash-command menu for block insertion, keyboard shortcuts, focus mode, and dark mode.
- Support block types: paragraphs, headings (H1-H3), bold/italic/underline/strikethrough, links, quotes, code blocks, ordered/unordered lists, checklists, tables, images with captions (plus resize and alignment), horizontal dividers, and optional embedded videos.
- Add debounced autosave for drafts with a visible save-status indicator. Autosave never changes an article's slug or status.
- Add admin lifecycle actions for articles: create, edit, preview, publish, unpublish, schedule, delete. Delete is hard delete (no `deleted_at`).
- Add draft / scheduled / published states, slug generation (auto from title on first save only, manually overridable, unique; on collision the API rejects the save), SEO metadata, featured image, categories, tags, author attribution (always derived from the session), and publication timestamps. Publishing sets `published_at` to the current time; unpublishing clears it.
- **Gate every admin endpoint on the existing permission catalog** rather than on a bare staff check: `news.manage` for articles, `category.manage` for categories, `tag.manage` for tags, `media.manage` for media. Authorization is permission-based; no endpoint branches on a role name. Roles are dynamic database records, not a fixed enum.
- Generate sanitized, semantic HTML server-side on every save (allowlist-based, via the `sanitizeHtml` lib already scaffolded in the architecture) — the public site renders only this stored HTML, never the editor's raw output.
- Add admin CRUD APIs for articles, categories, and tags. **Articles relate to categories many-to-many** (via `app.article_categories`), exactly as they already do to tags — there is no single `articles.category_id`.
- Add media upload **to the application's local filesystem**, with an allowlist of image MIME types, a maximum file size, magic-byte content sniffing (the browser-declared `Content-Type` is never trusted alone), server-generated filenames, and date-sharded storage paths. The R2 presigned-upload flow described in `docs/ARCHITECTURE.md` §7 is deferred and not built here.
- Add an `app.media` table as the canonical media record (id, storage_path, mime, size_bytes, original_filename, alt, caption, uploaded_by, created_at). Articles reference their cover image by `featured_media_id` FK; the public URL is derived from the media record at map time, never stored on the article. A fuller media management capability (galleries, library UI, virus scanning) is out of scope.
- Add public, read-only APIs that serve only published articles (list with pagination, category/tag filtering and an `excludeIds` parameter, plus fetch by slug). The public query layer treats a `scheduled` article whose `published_at` has passed as published, so the API is correct even before the cron worker has flipped the stored status.
- Revalidate `/`, `/news` and `/news/<slug>` on every event that changes public output (publish, unpublish, delete, scheduled promotion, and updates to a live article).
- **BREAKING**: none today. A new public news API is introduced here; `apps/web`'s consumption of it (`/news`, `/news/[slug]`) is a follow-up change and is not part of this proposal.

## Capabilities

### New Capabilities
- `article-editor`: The admin writing experience — canvas, floating toolbar, slash-command menu, supported block types, keyboard shortcuts, focus mode, dark mode, and autosave-triggering behavior.
- `article-management`: The admin-facing article lifecycle — draft/schedule/publish/unpublish/delete, slug/SEO/featured media/categories/tags/author/timestamps, permission-gated access, content sanitization, and the admin CRUD API contract.
- `category-management`: Category CRUD gated on `category.manage`, and the many-to-many association between articles and categories.
- `tag-management`: Tag CRUD gated on `tag.manage`, and the many-to-many association between articles and tags.
- `media-management`: Local-filesystem media upload gated on `media.manage` — type allowlist, size limit, magic-byte validation, storage naming and paths, the `app.media` record, and public URL derivation.
- `public-news-api`: The public, read-only API surface for published articles consumed by `apps/web`.

### Modified Capabilities
_None — no existing specs cover articles, categories, tags, or media yet. This change consumes `authorization` and `rbac-management` as they already exist; it does not modify them and adds no new permission catalog rows._

## Impact

- **Affected code**: `apps/api/src/modules/articles/**`, `apps/api/src/modules/categories/**`, `apps/api/src/modules/tags/**`, `apps/api/src/modules/media/**` (all new: routes, controller, service, repository, mapper), `packages/db` (new `media`, `articles`, `categories`, `tags`, `article_categories`, `article_tags` tables + migration), `packages/contracts` (new article/category/tag/media Zod schemas), `apps/api/src/lib/sanitizeHtml.ts` (allowlist rules for the full block set), `apps/api/src/lib/mediaStorage.ts` (new — local filesystem writer and validator; `lib/storage.ts`'s R2 placeholder is left unused by this change), `apps/api/src/lib/revalidate.ts` (new — the webhook caller), `apps/api/src/config/env.ts` (`MEDIA_STORAGE_PATH`, `MEDIA_PUBLIC_BASE_URL`, `MEDIA_MAX_BYTES`), `apps/admin` (editor UI, article list/detail pages, autosave hook, category/tag/media management). `apps/web` is not modified in this change; its consumption of the public news API is a follow-up change.
- **Docs**: `docs/ARCHITECTURE.md` §7 must be updated to record that media is stored on the local filesystem for now and that the R2 presigned flow is deferred.
- **Dependencies**: Tiptap plus extensions (table, task-list, image, placeholder, character-count), the existing auth middleware (`authenticate`, `requirePermission`), and the existing seeded permission catalog. No object-storage dependency.
- **Migration**: None on existing data. All new tables, created in FK order (`media` before `articles`; `categories`/`tags` before their join tables); no existing data affected and no new permission rows seeded.
