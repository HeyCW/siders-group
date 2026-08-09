## Context

Per `docs/ARCHITECTURE.md` §4, §6.3 and §8.2: the API is module-per-feature (`apps/api/src/modules/articles/`), Drizzle over Supabase Postgres in the `app` schema, and the admin editor is Tiptap. See `proposal.md` - Why for the motivation.

**The authorization model this change builds on** (delivered by `add-auth-foundation`, already implemented):

```
Roles       = dynamic database records (app.roles) — created, renamed and deleted at runtime
Permissions = a fixed catalog (app.permissions) — seeded by migration only, never via the API
Authorization = permission-based: an endpoint declares a permission key, never a role name
```

Only one role is seeded (`Owner`, `is_system = true`). There is **no fixed `owner | editor | author` role enum** — any earlier statement to that effect was wrong. `specs/authorization/spec.md` is explicit that the system "SHALL NOT branch on the name of any role", and `apps/api/src/middleware/authorize.ts` implements `requirePermission(key)` accordingly, recognising Owner only by the seeded row's immutable id.

Migration `0000_useful_red_shift.sql` already seeds four catalog permissions written for exactly this change: `news.manage`, `category.manage`, `tag.manage`, `media.manage`. This change wires them up; it adds no new catalog rows.

## Goals / Non-Goals

**Goals:**
- Define the article content/data model, the admin CRUD + lifecycle API, the public read API, and the editor's observable behavior precisely enough to implement and test independently.
- Keep sanitization on the write path (§9.4 of the architecture), never on render.
- Make scheduled publishing correct even if the promotion worker is briefly down.
- Gate every admin endpoint on the catalog permission that matches its domain.

**Non-Goals:**
- Comments, moderation, and analytics (separate modules already listed in the architecture).
- Multi-author / collaborative real-time editing — single editor per article, last-write-wins autosave.
- Any change to the staff authentication or authorization *mechanism*. This change consumes `requirePermission`; it does not modify it, and it adds no new permission keys.
- Object-storage media (Cloudflare R2). Deferred — see "Media storage" below.

## Decisions

**Authorization: permission-based, per domain.** Every admin endpoint in this change declares a catalog permission. `requireStaff` alone is **not** sufficient: it proves only that the caller is an active staff member, which would let any role — including one holding just `dashboard.view` — delete a published article.

```
authenticate  →  requirePermission("<key>")  →  handler
```

| Surface | Permission |
|---|---|
| Article create / read / update / delete / autosave / preview | `news.manage` |
| Article publish / unpublish / schedule | `news.manage` |
| Assigning existing categories or tags **to an article** | `news.manage` (it is an article edit) |
| Category create / update / delete | `category.manage` |
| Tag create / update / delete | `tag.manage` |
| Media upload / update / delete | `media.manage` |
| Public read endpoints | `requirePublic()` |

The Owner role satisfies every check via the existing bypass in `requirePermission`; no endpoint needs to special-case it. Every route must carry one of the four declaration shapes or `auditAuthorizationDeclarations` fails boot — silence is a denial, not a grant.
- Alternative considered: a single `news.manage` covering categories, tags and media too. Rejected — the catalog already distinguishes them, and collapsing four seeded keys into one would leave three rows permanently unused and make least-privilege roles (a photographer who may upload media but not publish) impossible to express.

**Content storage: `body_json` is the source of truth, `body_html` is derived.** The editor persists Tiptap/ProseMirror JSON to `body_json`. On every save, the API runs it through `sanitizeHtml` to produce `body_html`, which is what the public site renders. This matches the architecture's explicit instruction to sanitize on write, not on render, and means the public path never depends on the editor at all.
- Alternative considered: store only HTML and re-parse it back into the editor on open. Rejected — round-tripping HTML through a rich editor is lossy (attributes, node identity) and makes structural edits (e.g. table cell operations) harder than operating on the native document JSON.

**Editor library: Tiptap.** Already named in the architecture; it's ProseMirror underneath, ships first-party extensions for every required block (Table, TaskList, Image, CodeBlock, Placeholder), and its `BubbleMenu`/`FloatingMenu` primitives map directly onto the Medium-style floating toolbar and slash-command requirements.
- Alternative considered: plain ProseMirror (more control, much more to build by hand) and Slate (weaker table/collab ecosystem). Both rejected as unnecessary given Tiptap covers the full block list out of the box.

**Slug generation, and when it is *not* regenerated.** Auto-derive a kebab-case ASCII slug from the title **only when the slug is empty** — in practice, on first save. Once a slug exists, nothing regenerates it: not a title edit, not an autosave, not publishing. Staff may override it manually at any time, before or after publish. Uniqueness is enforced by a DB unique constraint on `slug`; on collision the API rejects the save with a slug-conflict error and the staff member chooses a different value — it does **not** auto-append `-2`, `-3` variants.
- Rationale for freezing the slug: autosave fires every 1-2 seconds while typing. If the slug tracked the title, a half-typed headline would generate a half-typed slug, and every keystroke would risk a slug-conflict error that fails an autosave the user never asked for. Freezing after first save makes autosave incapable of producing a slug conflict.
- Alternative considered: regenerate the slug on title change while the article is still a draft. Rejected for the autosave-churn reason above, and because a slug that silently moves under an editor who already shared a preview link is worse than one that is stale.

**Scheduling: status flag plus a lazy read-time fallback, not a hard dependency on a worker.** `articles.status` is `draft | scheduled | published`, with `published_at` holding the target (or actual) publish time.
- A cron worker runs every minute: finds `scheduled` articles whose `published_at <= now()`, flips them to `published`, and calls the `REVALIDATE_SECRET`-protected webhook so `apps/web`'s ISR pages update.
- The **public read API** additionally treats any `scheduled` article whose `published_at <= now()` as published at query time, regardless of whether the worker has flipped the flag yet. This decouples correctness (an article is never late) from the worker's uptime (revalidation may lag, but the API is never wrong).
- Alternative considered: pure lazy evaluation with no worker at all. Rejected — `apps/web` uses ISR/SSG, so something has to actively trigger revalidation at the scheduled time or the page won't update until the next unrelated build/revalidate.

**`published_at` lifecycle: publishing sets it, unpublishing clears it.** Precisely:

| Transition | `status` | `published_at` |
|---|---|---|
| Create | `draft` | `NULL` |
| Schedule (future time `T`) | `scheduled` | `T` |
| Reschedule while still future | `scheduled` | new `T` |
| Publish now (from `draft` **or** `scheduled`) | `published` | **`now()`, always** |
| Worker promotes a due `scheduled` article | `published` | unchanged (the scheduled `T`, already in the past) |
| Unpublish | `draft` | **`NULL`** |

Publishing always overwrites `published_at` with the current time rather than keeping an existing value. Without this, "schedule for next Tuesday → publish now" leaves a `published` article carrying a *future* `published_at`: publicly visible, but sorting to the top of a date-descending list and displaying a date that has not happened. Clearing on unpublish closes the same hole from the other side.
- Accepted trade-off: an unpublish → republish cycle loses the original publication date. A `first_published_at` column would preserve it; not added, since nothing in this change reads it. It is a one-column migration if a requirement emerges.

**Media storage: the local filesystem, not R2.** For this change, uploaded files are written to a directory on the application's own filesystem. `docs/ARCHITECTURE.md` §7 describes a Cloudflare R2 presigned-PUT flow with on-demand CDN derivatives; that remains the eventual target but is **not** what this change builds, and the architecture doc must be updated to say so (task 12.1).

```
Client POSTs the file  →  Server validates (size, declared MIME, magic bytes)
                       →  Server writes it under MEDIA_STORAGE_PATH
                       →  Server inserts the app.media row
                       →  Article references it by media id
```

- **Allowed types:** `image/jpeg`, `image/png`, `image/webp`, `image/gif`, `image/avif`. Nothing else, and no video or document uploads in this change.
- **Maximum size:** 10 MiB per file, enforced both by the body-size limit and by an explicit check before the file is written.
- **Content-type validation:** the browser-declared `Content-Type` is treated as a *hint only*. The server sniffs the leading magic bytes and derives the real type from them; if the sniffed type is not in the allowlist, or disagrees with the declared type, the upload is rejected and no file is written and no row inserted. This is `docs/ARCHITECTURE.md` §7's "a browser-declared `Content-Type` is a claim, not a fact", applied to local storage.
- **Naming and paths:** the stored filename is `<uuid>.<ext>`, where the uuid is server-generated and the extension is derived from the **sniffed** type. The client's original filename is recorded in `app.media.original_filename` for display but never appears in a path — that is what makes directory traversal (`../../etc/passwd`) structurally impossible rather than filtered. Files are sharded by upload date to keep directories small: `<MEDIA_STORAGE_PATH>/YYYY/MM/<uuid>.<ext>`.
- **Public URL derivation:** `app.media` stores the storage-root-relative path (`2026/08/<uuid>.webp`), never an absolute URL. The public URL is composed at map time as `MEDIA_PUBLIC_BASE_URL + '/' + storage_path`. Moving hosts, or later moving to R2/CDN, becomes a config change instead of a data migration.
- **New environment variables:** `MEDIA_STORAGE_PATH` (absolute directory), `MEDIA_PUBLIC_BASE_URL` (origin + optional prefix), `MEDIA_MAX_BYTES` (default 10485760). All Zod-validated in `config/env.ts`, so a missing value crashes at boot.
- Alternative considered: keep the R2 presigned flow. Rejected for this change on the explicit product decision to store media in the project filesystem; the mapper-derived URL above is specifically shaped so the R2 migration later touches the mapper and a config value, not the article rows.

**Featured image references `app.media`; it is not a URL column.** `articles.featured_media_id uuid NULL REFERENCES app.media(id) ON DELETE SET NULL`.

```
app.articles.featured_media_id  →  app.media.storage_path  →  local filesystem
                                            ↓
                            public URL = MEDIA_PUBLIC_BASE_URL + '/' + storage_path
```

- Alternative considered (and previously specified): a `featured_image_url` text column holding a display URL, with `app.media` as a parallel record linked back by a polymorphic `owner_type`/`owner_id` pair. Rejected on two counts. First, nothing distinguished the featured image from the article's inline body images — both would carry `owner_type = 'article'` with the same `owner_id`, so "which media row is the cover?" had no answer. Second, freezing a display URL into the article row defeats deriving sized variants later; a stored key can produce any number of renditions, a baked URL cannot. `ON DELETE SET NULL` means deleting a media row clears the reference rather than cascading into article deletion.

**Data model.** Six new tables in the `app` schema:
- `app.media`: id, storage_path (unique), mime, size_bytes, original_filename, alt, caption, uploaded_by (fk → `app.users`, `ON DELETE SET NULL`), created_at. Created **before** `app.articles` so the featured-image FK can be declared inline.
- `app.articles`: id, title, slug (unique), body_json (jsonb), body_html (text), excerpt, status (enum `draft | scheduled | published`), author_id (fk → `app.users`), featured_media_id (fk → `app.media`, nullable, `ON DELETE SET NULL`), seo_title, seo_description, published_at (nullable), created_at, updated_at.
- `app.categories`: id, name, slug (unique), created_at.
- `app.tags`: id, name, slug (unique), created_at.
- `app.article_categories`: article_id, category_id (composite PK) — many-to-many, both FKs `ON DELETE CASCADE`.
- `app.article_tags`: article_id, tag_id (composite PK) — many-to-many, both FKs `ON DELETE CASCADE`.
- RLS enabled with default deny on **all six** tables, consistent with every other table in the schema (§6.3). The API's database role has `BYPASSRLS`; RLS default-deny protects the database from any future direct-connection tooling, not from the API itself.
- `search_vector` (full-text search) is **deferred** to a follow-up change; the architecture doc mentions it but it is not required by the specs in this change.

**Categories are many-to-many, like tags.** An article has zero or more categories and zero or more tags, both through join tables. There is no `articles.category_id`.
- Alternative considered: a single nullable `category_id` on `articles` (the previous design). Rejected — the article-management requirement already said "one or more categories", so the single FK contradicted its own spec, and a newsroom story that is legitimately both *Business* and *Politics* had no representation. The public filter is unaffected in shape: filtering by one category is a join predicate instead of a column equality.
- Deleting a category detaches it from its articles via `ON DELETE CASCADE` on the join table; it never deletes the articles themselves.

**Revalidation: three paths, named explicitly.** `apps/web/app/api/revalidate/route.ts` accepts **one path per POST**, so any event that changes public output issues one call per affected path, using the shared `REVALIDATE_SECRET`:

| Path | Why |
|---|---|
| `/news/<slug>` | the article's own detail page |
| `/news` | the listing that includes it |
| `/` | the homepage surfaces published articles |

Triggered by: publish, unpublish, delete, the scheduled-publish worker's promotion, and any update to an article that is currently publicly visible. A revalidation call that fails is logged and **does not fail the originating write** — the write is already committed, and ISR's 60-second window is the backstop.

**Preview.** `GET /admin/articles/:id/preview`, gated on `news.manage`, returns the same DTO as the public read endpoint with the published-only filter bypassed. Status is unchanged. Implemented as a thin wrapper over the public read mapper.

**Public list pagination.** Offset-based: `limit` (default 20, max 100) and `offset` (default 0), ordered by `published_at` descending with `id` as a tiebreaker so paging is stable. The endpoint also accepts an optional `excludeIds` set, which removes specific articles from the result before the limit is applied.
- `excludeIds` exists for composed surfaces — the homepage curation change (`home-curation`) fills uncurated slots from this endpoint and must not repeat an article it has already placed in a curated slot. Without it, that consumer would have to over-fetch and filter client-side, guessing at how much to over-fetch.
- Alternative considered: cursor pagination. Rejected as premature — offset paging is correct for a listing ordered by a stable timestamp at this scale, and cursors complicate the `excludeIds` interaction for no present benefit.

**Autosave.** Client debounces edits (idle-based, ~1-2s of no input) and issues a `PATCH` to the draft, which runs the same sanitize-on-write path as an explicit save. No operational-transform or CRDT layer — single-editor assumption makes last-write-wins acceptable. Autosave never changes the slug (see "Slug generation" above) and never changes status.

## Risks / Trade-offs

- **[Editor/sanitizer allowlist drift]** → New Tiptap block types added later could be silently stripped by an allowlist sanitizer that wasn't updated. Mitigation: one test per supported block type asserting it survives the sanitize step, run in CI.
- **[Last-write-wins autosave]** → Two tabs editing the same article silently overwrite each other. Accepted per Non-Goals (no realtime collab requirement); documented so it isn't mistaken for a bug later.
- **[Scheduled-publish worker downtime]** → Revalidation could lag behind the scheduled time. Mitigated by the read-time fallback above: the public API is always correct even if the CDN/ISR page takes longer to catch up.
- **[ProseMirror JSON schema evolution]** → Future editor changes could change the shape of `body_json` for already-saved articles. Mitigation: out of scope for this change, but flagged so a `schema_version` field is a cheap addition if/when the block set changes.
- **[Local media storage is not replica-safe]** → Files on one API instance's disk are invisible to another, and are lost if the container is replaced. Accepted for this change on the explicit decision to store media locally; the deployment must therefore mount `MEDIA_STORAGE_PATH` on durable, shared storage, or run a single API instance. This constraint disappears when media moves to R2, which is why the public URL is derived rather than stored.
- **[Unpublish → republish loses the original publication date]** → Accepted; see the `published_at` lifecycle table. Preserving it is a `first_published_at` column if it is ever needed.
- **[Media rows can be orphaned]** → An upload whose article is never saved leaves a file and row with nothing referencing them. Accepted for this change (no reaper job); `uploaded_by` and `created_at` make a later cleanup task straightforward.

## Build Order

The tasks are grouped to follow this sequence; do not skip ahead:

1. **Sanitizer first** — `sanitizeHtml` allowlist with per-block tests. The public read path depends on it, the editor depends on it, and the design's central correctness claim ("only sanitized HTML is served") is unverifiable without it.
2. **Data model + contracts** — Drizzle tables in FK order (`media` → `articles` → `categories`/`tags` → join tables), RLS on all six, Zod schemas, status enum, unique constraints. This is the foundation everything else queries against.
3. **Media module** — local-filesystem write path, magic-byte validation, `app.media` row creation, URL derivation. Articles cannot carry a featured image until this exists.
4. **Admin write path** — articles module (routes → controller → service → repository → mapper), autosave, slug generation/collision, category/tag assignment, publish/unpublish/schedule. Every route declares `requirePermission('news.manage')`. The `author_id` is always taken from the session; the Zod schemas SHALL NOT declare an `author_id` field.
5. **Category and tag modules** — CRUD gated on `category.manage` and `tag.manage` respectively.
6. **Public read path** — list + by-slug endpoints, with the read-time fallback (`scheduled && published_at <= now()` ⇒ published) baked into the same query layer, plus pagination and `excludeIds`. This is the cleanest end-to-end test of the sanitize-on-write pipeline and is more important than the cron worker for correctness.
7. **Revalidation + scheduled-publish worker** — the shared revalidation caller, then the cron that flips due `scheduled` articles to `published`. Correctness is already guaranteed by step 6; the worker only drives revalidation latency.
8. **Preview endpoint** — thin wrapper over the public read mapper, gated on `news.manage`.
9. **Admin editor UI** — Tiptap canvas, bubble menu, slash command, focus mode, dark mode, autosave indicator.
10. **Admin management UI** — list, create/edit, metadata, actions.

## Migration Plan

Net-new tables only; no existing data or contracts change. Table creation order is constrained by foreign keys: `app.media` before `app.articles` (featured-image FK), `app.categories` and `app.tags` before their join tables. Rollback is dropping the six new tables and the module route registrations — no backfill involved.

No new permission catalog rows are inserted: `news.manage`, `category.manage`, `tag.manage` and `media.manage` were seeded by `0000_useful_red_shift.sql`, and the Owner role already holds them through that migration's `CROSS JOIN` grant.

**Deletion is hard delete.** The spec's "removed" is interpreted as row deletion. There is no `deleted_at` column; unpublish moves an article back to `draft` and clears `published_at` (soft-state), while delete is permanent. Deleting an article cascades its `article_categories` and `article_tags` rows; it does not delete referenced `app.media` rows or their files. If a soft-delete requirement emerges later, it is a one-column migration.
