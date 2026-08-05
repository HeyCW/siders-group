## Context

Per `docs/ARCHITECTURE.md` §4, §6.3 and §8.2: the API is module-per-feature (`apps/api/src/modules/articles/`), Drizzle over Supabase Postgres in the `app` schema, media on Cloudflare R2 via presigned PUT, and the admin editor is Tiptap. Staff auth (JWT sessions, roles `owner | editor | author`, `requireStaff` middleware) already exists and is out of scope here. See `proposal.md` - Why for the motivation.

## Goals / Non-Goals

**Goals:**
- Define the article content/data model, the admin CRUD + lifecycle API, the public read API, and the editor's observable behavior precisely enough to implement and test independently.
- Keep sanitization on the write path (§9.4 of the architecture), never on render.
- Make scheduled publishing correct even if the promotion worker is briefly down.

**Non-Goals:**
- Comments, moderation, and analytics (separate modules already listed in the architecture).
- Multi-author / collaborative real-time editing — single editor per article, last-write-wins autosave.
- Any change to staff authentication or authorization.

## Decisions

**Content storage: `body_json` is the source of truth, `body_html` is derived.** The editor persists Tiptap/ProseMirror JSON to `body_json`. On every save, the API runs it through `sanitizeHtml` to produce `body_html`, which is what the public site renders. This matches the architecture's explicit instruction to sanitize on write, not on render, and means the public path never depends on the editor at all.
- Alternative considered: store only HTML and re-parse it back into the editor on open. Rejected — round-tripping HTML through a rich editor is lossy (attributes, node identity) and makes structural edits (e.g. table cell operations) harder than operating on the native document JSON.

**Editor library: Tiptap.** Already named in the architecture; it's ProseMirror underneath, ships first-party extensions for every required block (Table, TaskList, Image, CodeBlock, Placeholder), and its `BubbleMenu`/`FloatingMenu` primitives map directly onto the Medium-style floating toolbar and slash-command requirements.
- Alternative considered: plain ProseMirror (more control, much more to build by hand) and Slate (weaker table/collab ecosystem). Both rejected as unnecessary given Tiptap covers the full block list out of the box.

**Slug generation.** Auto-derive a kebab-case ASCII slug from the title on first save; allow manual override at any time before or after publish. Uniqueness is enforced by a DB unique constraint on `slug`. On collision the API rejects the save with a slug-conflict error and the staff member chooses a different slug — it does **not** auto-append `-2`, `-3` variants. Editing the title after a slug has been manually set does not regenerate the slug.

**Scheduling: status flag plus a lazy read-time fallback, not a hard dependency on a worker.** `articles.status` is `draft | scheduled | published`, with `published_at` holding the target (or actual) publish time.
- A cron worker runs every minute: finds `scheduled` articles whose `published_at <= now()`, flips them to `published`, and calls the existing `REVALIDATE_SECRET`-protected webhook so `apps/web`'s ISR pages update.
- The **public read API** additionally treats any `scheduled` article whose `published_at <= now()` as published at query time, regardless of whether the worker has flipped the flag yet. This decouples correctness (an article is never late) from the worker's uptime (revalidation may lag, but the API is never wrong).
- Alternative considered: pure lazy evaluation with no worker at all. Rejected — `apps/web` uses ISR/SSG, so something has to actively trigger revalidation at the scheduled time or the page won't update until the next unrelated build/revalidate.

**Data model.** New tables in the `app` schema, following the existing `articles` stub in the architecture doc:
- `app.articles`: id, title, slug (unique), body_json (jsonb), body_html (text), excerpt, status (enum), author_id (fk → `app.users`), category_id (fk → `app.categories`, nullable), featured_image_url, seo_title, seo_description, published_at, created_at, updated_at.
- `app.categories`: id, name, slug (unique).
- `app.tags`: id, name, slug (unique).
- `app.article_tags`: article_id, tag_id (composite PK) — many-to-many.
- `app.media`: id, owner_type (`article` for now), owner_id (uuid), mime, size_bytes, r2_key, alt, caption, created_at. Minimum-viable image-metadata table; the `articles.featured_image_url` column stores the display URL while `app.media` holds the canonical record. A fuller media management capability (galleries, library UI, virus scanning) is out of scope here.
- RLS enabled with default deny on all five tables, consistent with every other table in the schema (§6.3). The API's database role has `BYPASSRLS`; RLS default-deny protects the database from any future direct-connection tooling, not from the API itself.
- `search_vector` (full-text search) is **deferred** to a follow-up change; the architecture doc mentions it but it is not required by the specs in this change.

**Preview.** `GET /admin/articles/:id/preview`, staff-only, returns the same DTO as the public read endpoint with the published-only filter bypassed. Status is unchanged. Implemented as a thin wrapper over the public read mapper.

**Autosave.** Client debounces edits (idle-based, ~1-2s of no input) and issues a `PATCH` to the draft, which runs the same sanitize-on-write path as an explicit save. No operational-transform or CRDT layer — single-editor assumption makes last-write-wins acceptable.

## Risks / Trade-offs

- **[Editor/sanitizer allowlist drift]** → New Tiptap block types added later could be silently stripped by an allowlist sanitizer that wasn't updated. Mitigation: one test per supported block type asserting it survives the sanitize step, run in CI.
- **[Last-write-wins autosave]** → Two tabs editing the same article silently overwrite each other. Accepted per Non-Goals (no realtime collab requirement); documented so it isn't mistaken for a bug later.
- **[Scheduled-publish worker downtime]** → Revalidation could lag behind the scheduled time. Mitigated by the read-time fallback above: the public API is always correct even if the CDN/ISR page takes longer to catch up.
- **[ProseMirror JSON schema evolution]** → Future editor changes could change the shape of `body_json` for already-saved articles. Mitigation: out of scope for this change, but flagged so a `schema_version` field is a cheap addition if/when the block set changes.

## Build Order

The tasks are grouped to follow this sequence; do not skip ahead:

1. **Sanitizer first** — `sanitizeHtml` allowlist with per-block tests. The public read path depends on it, the editor depends on it, and the design's central correctness claim ("only sanitized HTML is served") is unverifiable without it.
2. **Data model + contracts** — Drizzle tables, RLS, `app.media`, Zod schemas, status enum, unique slug constraint. This is the foundation everything else queries against.
3. **Admin write path** — articles module (routes → controller → service → repository → mapper), autosave, slug generation/collision, category/tag assignment, publish/unpublish/schedule. The `author_id` is always taken from the session; the Zod schemas SHALL NOT declare an `author_id` field.
4. **Public read path** — list + by-slug endpoints, with the read-time fallback (`scheduled && published_at <= now()` ⇒ published) baked into the same query layer. This is the cleanest end-to-end test of the sanitize-on-write pipeline and is more important than the cron worker for correctness.
5. **Scheduled-publish worker** — cron that flips due `scheduled` articles to `published` and calls the `REVALIDATE_SECRET` webhook. Correctness is already guaranteed by step 4; the worker only drives revalidation latency.
6. **Preview endpoint** — thin wrapper over the public read mapper, staff-only.
7. **Admin editor UI** — Tiptap canvas, bubble menu, slash command, focus mode, dark mode, autosave indicator.
8. **Admin management UI** — list, create/edit, metadata, actions.

## Migration Plan

Net-new tables only; no existing data or contracts change. Rollback is dropping the five new tables and the `articles` module route registration — no backfill involved.

**Deletion is hard delete.** The spec's "removed" is interpreted as row deletion. There is no `deleted_at` column; unpublish moves an article back to `draft` (soft-state), while delete is permanent. If a soft-delete requirement emerges later, it is a one-column migration.
