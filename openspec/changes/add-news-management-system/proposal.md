## Why

`docs/ARCHITECTURE.md` already names an `articles` module, an `app.articles` table, and a Tiptap-based editor in `apps/admin`, but no behavior has been specified: editors have no defined workflow for drafting, previewing, scheduling, or publishing long-form content, and there is no contract for how published articles reach the public site. Without this, `apps/api/src/modules/articles` and the `apps/admin` editor have nothing concrete to build against.

## What Changes

- Add a distraction-free, Tiptap-based rich text editor to `apps/admin`: large centered canvas, floating contextual toolbar (Medium-style), `/` slash-command menu for block insertion, keyboard shortcuts, focus mode, and dark mode.
- Support block types: paragraphs, headings (H1-H3), bold/italic/underline/strikethrough, links, quotes, code blocks, ordered/unordered lists, checklists, tables, images with captions (plus resize and alignment), horizontal dividers, and optional embedded videos.
- Add debounced autosave for drafts with a visible save-status indicator.
- Add admin lifecycle actions for articles: create, edit, preview, publish, unpublish, schedule, delete. Delete is hard delete (no `deleted_at`).
- Add draft / scheduled / published states, slug generation (auto from title, manually overridable, unique; on collision the API rejects the save), SEO metadata, featured image, categories, tags, author attribution (always derived from the session), and publication timestamps.
- Generate sanitized, semantic HTML server-side on every save (allowlist-based, via the `sanitizeHtml` lib already scaffolded in the architecture) — the public site renders only this stored HTML, never the editor's raw output.
- Add admin CRUD APIs for articles, categories, and tags.
- Add a minimal `app.media` table to record image uploads (id, owner_type, owner_id, mime, size_bytes, r2_key, alt, caption). This is the minimum needed for the article editor's image flow; a fuller media management capability (galleries, library UI, virus scanning) is out of scope.
- Add public, read-only APIs that serve only published articles (list with pagination/filtering, fetch by slug). The public query layer treats a `scheduled` article whose `published_at` has passed as published, so the API is correct even before the cron worker has flipped the stored status.
- **BREAKING**: none today. A new public news API is introduced here; `apps/web`'s consumption of it (`/news`, `/news/[slug]`) is a follow-up change and is not part of this proposal.

## Capabilities

### New Capabilities
- `article-editor`: The admin writing experience — canvas, floating toolbar, slash-command menu, supported block types, keyboard shortcuts, focus mode, dark mode, and autosave-triggering behavior.
- `article-management`: The admin-facing article lifecycle — draft/schedule/publish/unpublish/delete, slug/SEO/featured image/categories/tags/author/timestamps, content sanitization, and the admin CRUD API contract.
- `public-news-api`: The public, read-only API surface for published articles consumed by `apps/web`.

### Modified Capabilities
_None — no existing specs cover articles yet._

## Impact

- **Affected code**: `apps/api/src/modules/articles/**` (new: routes, controller, service, repository, mapper), `packages/db` (new `articles`, `categories`, `tags`, `article_tags`, `media` tables + migration), `packages/contracts` (new article/category/tag/media Zod schemas), `apps/api/src/lib/sanitizeHtml.ts` (allowlist rules for the full block set), `apps/api/src/lib/storage.ts` (reused for presigned image uploads), `apps/admin` (editor UI, article list/detail pages, autosave hook). `apps/web` is not modified in this change; its consumption of the public news API is a follow-up change.
- **Dependencies**: Tiptap plus extensions (table, task-list, image, placeholder, character-count), the existing staff auth middleware (`authenticate`, `requireStaff`), the existing R2 presigned-upload flow.
- **Migration**: None. All new tables; no existing data affected.
