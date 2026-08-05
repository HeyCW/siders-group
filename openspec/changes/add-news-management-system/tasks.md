## 1. Data model

- [ ] 1.1 Add `app.articles`, `app.categories`, `app.tags`, `app.article_tags` tables to the Drizzle schema (`packages/db`)
- [ ] 1.2 Enable RLS with default deny on all four new tables
- [ ] 1.3 Generate and apply the migration via `drizzle-kit` against `DIRECT_URL`
- [ ] 1.4 Add unique constraints on `articles.slug`, `categories.slug`, `tags.slug`
- [ ] 1.5 Add `app.media` table (id, owner_type, owner_id, mime, size_bytes, r2_key, alt, caption, created_at) + RLS + migration
- [ ] 1.6 Defer `app.articles.search_vector` to a follow-up change (out of scope here)
- [ ] 1.7 Confirm the API's database role has `BYPASSRLS` (or write the equivalent RLS policy) so RLS default-deny is meaningful rather than vacuous

## 2. Contracts

- [ ] 2.1 Add Zod schemas in `packages/contracts` for article create/update, category, and tag
- [ ] 2.2 Add a `status` enum (`draft | scheduled | published`) shared between contracts and Drizzle schema

## 3. Sanitization

- [ ] 3.1 Implement/extend `apps/api/src/lib/sanitizeHtml.ts` with an allowlist covering every block type: headings, lists, checklists, tables, code blocks, quotes, images (with caption/alignment attributes), links, dividers, video embeds
- [ ] 3.2 Add a test per block type asserting it survives sanitization, and one asserting a disallowed node/attribute is stripped

## 4. Admin API — articles module

- [ ] 4.1 Scaffold `apps/api/src/modules/articles/` (routes, controller, service, repository, mapper)
- [ ] 4.2 Implement create/update/delete, gated by `authenticate` + `requireStaff`
- [ ] 4.3 Implement slug auto-generation from title with manual override and collision handling
- [ ] 4.4 Implement autosave endpoint (partial update to a draft) running content through the sanitizer on every write
- [ ] 4.5 Implement publish, unpublish, and schedule (future `published_at`) actions
- [ ] 4.6 Implement `GET /admin/articles/:id/preview` returning the public-read DTO with the published-only filter bypassed; status unchanged
- [ ] 4.7 Implement category/tag assignment on articles
- [ ] 4.8 Ensure author is derived from the authenticated session, never from client input

## 5. Scheduled publishing

- [ ] 5.1 Add a cron worker that promotes `scheduled` articles with `published_at <= now()` to `published` and calls the `REVALIDATE_SECRET` webhook

## 6. Public API

- [ ] 6.1 Implement public list endpoint: published-only, paginated, filterable by category and tag, ordered by `published_at` descending
- [ ] 6.2 Implement public get-by-slug endpoint: published-only, 404 on unknown/unpublished/draft/future-scheduled slugs
- [ ] 6.3 Confirm unpublish and delete immediately remove an article from both public endpoints
- [ ] 6.4 Implement the read-time fallback: in the public read query layer, treat `scheduled && published_at <= now()` as published so the public path is correct even if the worker is down
- [ ] 6.5 Confirm the public read mapper never includes `body_json` in the response — only `body_html`

## 7. Admin editor UI

- [ ] 7.1 Set up Tiptap in `apps/admin` with the required extensions (Table, TaskList, Image, CodeBlock, Placeholder, Link, etc.)
- [ ] 7.2 Build the centered writing canvas with a separate title field
- [ ] 7.3 Build the floating contextual (bubble menu) toolbar shown only on selection/cursor focus
- [ ] 7.4 Build the `/` slash-command menu for block insertion
- [ ] 7.5 Wire keyboard shortcuts (bold, italic, underline, undo, redo, block split/merge)
- [ ] 7.6 Implement image insertion with resize, alignment, and caption, wired to the existing R2 presigned-upload flow
- [ ] 7.7 Implement focus mode (hide surrounding admin chrome)
- [ ] 7.8 Implement dark mode toggle with persisted user preference

## 8. Admin management UI

- [ ] 8.1 Build article list view (draft/scheduled/published filters)
- [ ] 8.2 Build create/edit view wired to autosave with a visible save-status indicator
- [ ] 8.3 Add slug field (auto-filled, editable), SEO title/description fields, featured image picker, category/tag selectors
- [ ] 8.4 Add publish, unpublish, schedule (date/time picker), preview, and delete controls

## 9. Verification

- [ ] 9.1 Unit/integration tests covering each scenario in `specs/article-editor/spec.md`, `specs/article-management/spec.md`, and `specs/public-news-api/spec.md`
- [ ] 9.2 Manual QA pass: draft → autosave → schedule → scheduled time passes → confirm public visibility without manual intervention → unpublish → confirm removal
- [ ] 9.3 Add a public-read integration test asserting a `scheduled` article with `published_at <= now()` is returned by the public list and by-slug endpoints even if the worker has not yet flipped the stored status
