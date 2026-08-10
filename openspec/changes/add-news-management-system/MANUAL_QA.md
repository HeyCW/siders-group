# Manual QA — add-news-management-system

## What this list is for

297 automated tests cover the service layer, the sanitizer, the storage helper, the contracts, and
the scheduled-publish worker. Every one of them runs against in-memory fakes. **Nothing in this
change has executed a single line of SQL against real Postgres, and the migration has never been
applied** (tasks.md 2.8). Nine things have no automated coverage at all:

| Never executed for real |
|---|
| `apps/api/src/modules/articles/article.repository.ts` (356 lines, incl. every join and the public-visibility predicate) |
| `apps/api/src/modules/media/media.repository.ts` |
| `apps/api/src/modules/categories/category.repository.ts` |
| `apps/api/src/modules/tags/tag.repository.ts` |
| `ON DELETE CASCADE` on `article_categories` / `article_tags` |
| `ON DELETE SET NULL` on `articles.featured_media_id` |
| `requirePermission` against real staff/role/session rows (tasks.md 13.2, 13.4) |
| Real file writes under `MEDIA_STORAGE_PATH`, and serving them back over HTTP |
| Wall-clock time actually passing for the scheduled-publish worker |

That is the point of this list. Sections are ordered so never-executed code runs first and a failure
surfaces early. Section 15 lists what is deliberately **not** here.

---

## Read this first — two things will block you

**1. The admin SPA cannot perform any write.** `apps/admin/src/lib/api.ts` never sends an
`x-csrf-token` header, but `createCsrfMiddleware` rejects every `POST`/`PATCH`/`DELETE` that carries
a session cookie without one. Autosave, publish, delete, taxonomy CRUD, and image upload will all
return `403 csrf_failed` through the browser. Sections 1–12 drive the **API directly**
(Postman/curl) and are unaffected. Section 14 (editor UX), plus items 13.4 and 13.5, need this
local-dev patch first — three lines, do **not** commit it:

```ts
// apps/admin/src/lib/api.ts — LOCAL DEV ONLY, for section 11
function csrfHeader(): Record<string, string> {
  const raw = document.cookie.split('; ').find((c) => c.startsWith('csrf_token='));
  return raw ? { 'x-csrf-token': raw.slice('csrf_token='.length) } : {};
}
// then spread `...csrfHeader()` into apiFetch's `headers` and add `headers: csrfHeader()`
// to apiUpload's fetch call.
```

**2. The admin app has no login screen.** `App.tsx`'s `LoginPage` is a `<div>Login</div>` stub. Sign
in from the admin origin's devtools console instead — cookies are set on `localhost` and shared
across ports:

```js
await fetch('http://localhost:4000/auth/staff/login', {
  method: 'POST', credentials: 'include',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: 'owner@example.com', password: '<owner password>' }),
});
```

There is also **no navigation** to `/categories` or `/tags` — reach them by typing the URL.

For API-driven sections, the CSRF rule from add-auth-foundation's list still applies: every
state-changing request needs `x-csrf-token` exactly equal to the `csrf_token` cookie. Reuse the same
Postman **Tests**-tab snippet:

```js
const t = pm.cookies.get('csrf_token');
if (t) pm.collectionVariables.set('csrf_token', t);
```

---

## 0. Prerequisites

- [v] **0.1** `supabase start`, then apply `supabase/migrations/0001_silly_retro_girl.sql` — it has
  **never been applied**. Confirm all six tables exist: `app.media`, `app.articles`,
  `app.categories`, `app.tags`, `app.article_categories`, `app.article_tags`
- [v] **0.2** Confirm `app.articles` has **no** `category_id` and **no** `featured_image_url` column,
  and that `articles.slug`, `categories.slug`, `tags.slug`, `media.storage_path` are all UNIQUE
- [v] **0.3** Confirm RLS is enabled with default deny on all six tables, and that the API's DB role
  has `BYPASSRLS` — otherwise every query in this change returns zero rows (tasks.md 2.9). Skip the
  second half if you connect as the `postgres` superuser
- [V] **0.4** Confirm no new `app.permissions` rows were added — `news.manage`, `category.manage`,
  `tag.manage`, `media.manage` were already seeded by `0000_useful_red_shift.sql` and already granted
  to Owner (tasks.md 2.10)
- [V] **0.5** `.env` carries the three new variables and the API boots:
  - `MEDIA_STORAGE_PATH` — must start with `/` (Zod refuses anything else). On Windows use
    `/tmp/siders-media`, which Node resolves to the current drive root
  - `MEDIA_PUBLIC_BASE_URL=http://localhost:4000/media-files` for local dev, so uploaded URLs
    actually resolve through `mediaFileRoutes`
  - `MEDIA_MAX_BYTES` — leave unset to get the 10 MiB default
- [V] **0.6** Boot the API with `MEDIA_STORAGE_PATH` deleted from `.env` → **boot fails** with a
  config error, not a running server that accepts uploads (media spec — "Storage root is required
  configuration")
- [v] **0.7** Boot the API normally → the storage directory is created if absent
  (`ensureMediaStorageDir`), and the log line `api listening` appears with the cron job registered
- [v] **0.8** `ADMIN_ORIGIN=http://localhost:5173` and `APP_ORIGIN=http://localhost:3000` (Vite dev
  port is 5173; Next dev is 3000) — otherwise CORS blocks the admin app and revalidation posts to
  the wrong host

---

## 1. The spine — run this first

Nine requests, in order. This exercises `article.repository` (create + relations + read),
`category.repository`, `tag.repository`, `media.repository`, the featured-image FK, the taxonomy join
tables, and both public read paths. If it passes, most of the never-executed surface is proven.

- [ ] **1.1** Sign in as Owner → `204` with `sid_at` / `sid_rt` / `csrf_token`
- [ ] **1.2** `POST /categories` `{"name":"Match Reports"}` → `201`, server-derived `slug:
  "match-reports"`
- [ ] **1.3** `POST /tags` `{"name":"Under 21"}` → `201`, `slug: "under-21"`
- [ ] **1.4** `POST /media` as `multipart/form-data`, field name **`file`**, a real JPEG → `201` with
  `storagePath` shaped `YYYY/MM/<uuid>.jpg`, `mime: "image/jpeg"`, `sizeBytes`, `originalFilename`,
  and a `url` of `MEDIA_PUBLIC_BASE_URL` + path. Confirm the file exists on disk under that path
  *Proves: `storeUpload` writing for real, `media.repository.create`, and URL derivation at map time.*
- [ ] **1.5** `GET <that url>` in a browser with **no session** → the image loads
  *Proves: `mediaFileRoutes`' `requirePublic()` + static serving.*
- [ ] **1.6** `POST /admin/articles` with a title, both ids from 1.2/1.3, the media id from 1.4, an
  `excerpt`, `seoTitle`, `seoDescription`, and a small `bodyJson` doc → `201`. Response carries a
  generated kebab-case `slug`, `status: "draft"`, `publishedAt: null`, `authorId` = the Owner's id
  (**not** anything you sent), the category and tag inline, and a derived `featuredImageUrl`
  *Proves: the create transaction, both join-table inserts, `attachRelations`, author-from-session.*
- [ ] **1.7** `GET /admin/articles/<id>` → same shape, `bodyHtml` present and sanitized,
  `bodyJson` present
- [ ] **1.8** `POST /admin/articles/<id>/publish` → `200`, `status: "published"`, `publishedAt` ≈ now
- [ ] **1.9** `GET /articles` and `GET /articles/<slug>` **with no session at all** → both return the
  article; both include `bodyHtml` on the detail response and **neither includes `bodyJson`**;
  categories and tags are both present; `featuredImageUrl` is derived
  *Proves: `publiclyVisible()`, `listPublished`, `findPublishedBySlug`, and both public mappers.*

## 2. Slug rules — where a real unique constraint decides the outcome

- [ ] **2.1** Create an article titled `Local Team Wins Regional Cup` with no `slug` →
  `local-team-wins-regional-cup`
- [ ] **2.2** `PATCH /admin/articles/<id>` `{"title":"Something Completely Different"}` → `200`, and
  the **slug is unchanged** (article-management spec — "Title change does not move an existing slug")
- [ ] **2.3** `PATCH` a `slug` that already belongs to another article → **`409 slug_conflict`, not a
  500** — the unique index must be caught, not leaked
- [ ] **2.4** `PATCH` a valid new `slug` → `200`, stored as given
- [ ] **2.5** `PATCH` `{"slug":"Not Kebab Case"}` → `400` (contract regex, not a DB error)
- [ ] **2.6** `PATCH /admin/articles/<id>/autosave` with a **new title** on an article that already
  has a slug → `200`, slug unchanged, **no slug-conflict error**. Also confirm the autosave schema
  rejects a `slug` key outright with `400` (`.strict()`)
- [ ] **2.7** `POST /admin/articles` `{"title":"!!!"}` → **`400`, not a 500** (VERIFICATION_FIXES Fix 1)
- [ ] **2.8** Same for `POST /categories` `{"name":"你好"}` and `POST /tags` `{"name":"###"}` → `400`

## 3. Taxonomy — CRUD, conflicts, and cascade

- [ ] **3.1** `GET /categories` and `GET /tags` → both list what exists
- [ ] **3.2** `POST /categories` with a name that slugifies to an existing slug → **`409`, not a 500**
- [ ] **3.3** Same for `POST /tags` → **`409`, not a 500**
- [ ] **3.4** `PATCH /categories/<id>` `{"name":"Match Analysis"}` → `200`, and the new name appears on
  every article already associated with it (`GET /articles/<slug>`)
- [ ] **3.5** Assign **three** categories and **three** tags to one article → all six come back
- [ ] **3.6** `PATCH` that article with a `categoryIds` array omitting one → only the submitted ones
  remain; verify in SQL that the `article_categories` row is **gone**, not orphaned
- [ ] **3.7** Save an article with `categoryIds: []` and `tagIds: []` → succeeds, and it is still
  publishable
- [ ] **3.8** `DELETE /categories/<id>` while a **published** article holds it → `204`; that article is
  still published, still retrievable publicly, and simply no longer lists that category
  *Proves: `ON DELETE CASCADE` on the join table only — the articles row is untouched (tasks.md 13.8).*
- [ ] **3.9** Same for `DELETE /tags/<id>`
- [ ] **3.10** `GET /articles?categorySlug=<the deleted slug>` → empty result, not an error

## 4. Media validation — every rejection must leave no residue

For each rejection below, confirm **both**: no new file anywhere under `MEDIA_STORAGE_PATH`, and no
new row in `app.media`.

- [ ] **4.1** Upload a PDF → `415 unsupported_media_type`
- [ ] **4.2** Upload an SVG → `415` (SVG is deliberately not an accepted type)
- [ ] **4.3** Rename `something.pdf` to `something.png` and upload it → `415`, and the message is a
  **content mismatch or unsupported type**, never a success
- [ ] **4.4** Upload a real PNG but force the `Content-Type` part to `image/jpeg` → `415
  content_type_mismatch`
- [ ] **4.5** Upload a 0-byte file → `400 empty_file`
- [ ] **4.6** Upload a file >10 MiB → rejected (multer's `limits.fileSize` fires first; either that or
  `413 file_too_large` is correct — what matters is nothing lands on disk)
- [ ] **4.7** Upload a file just under 10 MiB → `201`
- [ ] **4.8** Upload one valid file of **each** accepted type — jpeg, png, webp, gif, avif → all `201`,
  each stored with the extension matching the **sniffed** type
- [ ] **4.9** Upload with the client filename `../../../etc/passwd.png` → `201`, and the stored path is
  still `YYYY/MM/<uuid>.png` under the root; `originalFilename` retains the string as **data only**
- [ ] **4.10** `PATCH /media/<id>` `{"alt":"...","caption":"..."}` → `200`, both persisted
- [ ] **4.11** In SQL, confirm `media.storage_path` is a **relative** path and no row holds a
  fully-qualified URL
- [ ] **4.12** Change `MEDIA_PUBLIC_BASE_URL`, restart, re-read any media item → the URL moved with no
  data migration

## 5. Featured image by reference

- [ ] **5.1** Set one media item as the featured image of **two** articles → both resolve to the same
  derived URL
- [ ] **5.2** `DELETE /media/<that id>` → `204`; **both** articles remain intact and retrievable, and
  each now reports `featuredMediaId: null` / `featuredImageUrl: null`
  *Proves: `ON DELETE SET NULL` firing for real (tasks.md 13.9). A 500 here means the FK is wrong.*
- [ ] **5.3** Confirm the stored file for that media id is also removed from disk
- [ ] **5.4** Create and publish an article with **no** featured image → succeeds; public response
  reports no featured image and is still valid

## 6. Lifecycle and the `published_at` contract

- [ ] **6.1** Publish a draft → `status: published`, `publishedAt` ≈ now
- [ ] **6.2** Publish an already-published article → **`409 invalid_status_transition`**
- [ ] **6.3** Unpublish → `status: draft`, `publishedAt` **null**, and it disappears from `GET /articles`
  and `GET /articles/<slug>` immediately
- [ ] **6.4** Unpublish a draft → `409`
- [ ] **6.5** Republish the article from 6.3 → `publishedAt` is a **new** now, not the earlier time
- [ ] **6.6** `POST /admin/articles/<id>/schedule` `{"publishedAt":"<+2 min>"}` → `200`, `status:
  scheduled`. Confirm it is **not** in `GET /articles` yet
- [ ] **6.7** Re-schedule it to a later future time → still `scheduled`, new time
- [ ] **6.8** Schedule with a **past** timestamp → `400 invalid_schedule_time`
- [ ] **6.9** **Publish the scheduled article early** → `status: published` and `publishedAt` is
  **overwritten with now**, not the future time. No published article may ever carry a future
  timestamp
- [ ] **6.10** `DELETE /admin/articles/<id>` on a published article → `204`; gone from admin **and**
  public; verify in SQL that its `article_categories` / `article_tags` rows are gone too
- [ ] **6.11** `GET /admin/articles/<deleted id>` → `404`
- [ ] **6.12** `GET /admin/articles/<draft id>/preview` → `200` with the public detail shape rendered
  from current content, and the article's status **stays `draft`**

## 7. The read-time visibility fallback — highest-value item on this list

This is design.md's core scheduling guarantee and tasks.md 13.11's "single most important scenario".

- [ ] **7.1** Schedule an article ~90 seconds out. **Stop the API's cron worker** (or set the
  `scheduled` row's `published_at` to a past time directly in SQL while leaving `status = 'scheduled'`)
- [ ] **7.2** With the status still literally `scheduled` in the database and `published_at` in the
  past, `GET /articles` → **the article appears**
- [ ] **7.3** Same state, `GET /articles/<slug>` → **the article is served**. List and by-slug must
  agree — there must be no window where one serves it and the other doesn't
- [ ] **7.4** In SQL, set a row to `status = 'published'` with `published_at = NULL`. `GET /articles`
  → the row is **silently omitted**, and the endpoint returns `200`, **not a 500**
  (VERIFICATION_FIXES Fix 3 — the `isNotNull` guard)
- [ ] **7.5** A `draft` article → absent from the list and `404` by slug
- [ ] **7.6** A `scheduled` article with a **future** `published_at` → absent from the list and `404`
  by slug

## 8. Public list — filters, pagination, exclusion, rate limit

Needs ~5 published articles, some sharing a category/tag.

- [ ] **8.1** `GET /articles` → ordered `publishedAt` **descending**
- [ ] **8.2** `GET /articles?categorySlug=<slug>` → only articles in that category, **including** ones
  that also belong to other categories
  *Proves: the `inArray` subquery over the join table (tasks.md 13.7).*
- [ ] **8.3** `GET /articles?tagSlug=<slug>` → same for tags
- [ ] **8.4** Both filters at once → the intersection
- [ ] **8.5** `GET /articles` with no `limit` → at most **20**
- [ ] **8.6** `GET /articles?limit=1000` → **at most 100, and a `200`** — clamped, not rejected
  (VERIFICATION_FIXES Fix 2)
- [ ] **8.7** `GET /articles?limit=0` and `?limit=-5` → `400`
- [ ] **8.8** Give two articles the **identical** `published_at` in SQL, then page with
  `limit=2&offset=0` and `limit=2&offset=2` → no article appears twice and none is skipped
- [ ] **8.9** `GET /articles?excludeIds=<id1>,<id2>` → neither appears
- [ ] **8.10** `GET /articles?limit=2&excludeIds=<one id>` with ≥3 other published articles → **2**
  articles returned, not 1 — exclusion applies before the limit
- [ ] **8.11** `excludeIds=<random uuid>` → `200`, no effect. `excludeIds=not-a-uuid` → `400`
- [ ] **8.12** Fire >120 requests in a minute from one IP → `429 rate_limited`, then recovery after
  the window
- [ ] **8.13** Call both public endpoints **while signed in as Owner** → byte-identical to the
  anonymous response; no drafts leak in

## 9. Revalidation

Run `apps/web` (`pnpm --filter @siders/web dev`) with the same `REVALIDATE_SECRET`, and watch its
request log.

- [ ] **9.1** Publish an article → the API posts to `/api/revalidate` **three times**: `/news/<slug>`,
  `/news`, and `/`
- [ ] **9.2** Unpublish → the same three paths
- [ ] **9.3** Delete a published article → the same three paths, using the slug it had
- [ ] **9.4** Autosave / update a **published** article → the three paths fire
- [ ] **9.5** Autosave a **draft** → **no** revalidation call (nothing public to invalidate)
- [ ] **9.6** Stop `apps/web` entirely, then publish → the publish still returns `200` and the status
  really is `published` in the database; the API logs a warning per failed path and swallows it
  *This is the "revalidation failure does not fail the write" guarantee.*
- [ ] **9.7** Set a wrong `REVALIDATE_SECRET` on the API → the web route answers `401`, the publish
  still succeeds

## 10. Scheduling with real wall-clock time

- [ ] **10.1** Schedule an article ~2 minutes out, leave the API running, and **wait**. Within a
  minute of the due time the log shows `scheduled article promoted to published`
- [ ] **10.2** That article's `published_at` is **still the scheduled time**, not the promotion time
- [ ] **10.3** Promotion triggered the three revalidation paths
- [ ] **10.4** Restart the API with a due `scheduled` article present → it is promoted on the next
  tick, and promoting it twice does not double-fire or error

## 11. Authorization against real rows

Create three roles and a staff member for each: one with `news.manage` only, one with
`category.manage` + `tag.manage` only, one with `media.manage` only.

- [ ] **11.1** Every admin article endpoint as a staff member **without** `news.manage` → `403`, and
  no article changes
- [ ] **11.2** With `news.manage` → allowed
- [ ] **11.3** Any admin article endpoint with **no session** → rejected, no change
- [ ] **11.4** Holding `news.manage` but **not** `category.manage`, assign an existing category to an
  article → **allowed** (attaching taxonomy is an article edit, not a catalog change)
- [ ] **11.5** Same caller, `POST /categories` → `403`. Same for `POST /tags` without `tag.manage`
- [ ] **11.6** `POST /media` without `media.manage` → `403`, **no file written, no row created**
- [ ] **11.7** Upload with no session → rejected, no file, no row
- [ ] **11.8** Rename a role that grants `news.manage` → its holders keep access with no code or
  config change (permission-based, never role-name-based)
- [ ] **11.9** Create a **brand-new** role at runtime granting `news.manage`, assign it → that caller
  gains access immediately

## 12. Sanitization — spot checks the unit tests can't reach

Send these as `bodyJson` through `PATCH .../autosave`, then read `bodyHtml` back.

- [ ] **12.1** Every block type survives: h1–h3, paragraph, bold/italic/underline/strike, link,
  blockquote, code block, ordered + unordered list, checklist (checked ≠ unchecked), table, image with
  caption, divider, video
- [ ] **12.2** An unknown node type (`{"type":"script","content":[...]}`) → **absent** from the output
- [ ] **12.3** A link with `href: "javascript:alert(1)"` → the text survives, the `<a>` does **not**
- [ ] **12.4** An image with `src: "javascript:..."` → the whole image is dropped
- [ ] **12.5** A `video` node → rendered as an inert `<a>` inside `<figure class="video-embed">`,
  **never** an `<iframe>`
- [ ] **12.6** An unexpected attribute (`onclick`, `style`) anywhere → stripped
- [ ] **12.7** Read the article twice → `bodyHtml` is byte-identical; sanitization happens on write,
  not on read
- [ ] **12.8** Confirm no public response anywhere carries a `bodyJson` key

## 13. Regression checks for the five post-verification fixes

Each of these was a real defect found after implementation. Re-check them by hand.

- [ ] **13.1 (Fix 1)** Empty auto-generated slug → covered by 2.7 / 2.8
- [ ] **13.2 (Fix 2)** `limit` clamps instead of 400 → covered by 8.6 / 8.7
- [ ] **13.3 (Fix 3)** `published` + null `published_at` is excluded, not a 500 → covered by 7.4
- [ ] **13.4 (Fix 4)** In the admin UI, click **New article**, go back to the list, click **New
  article** again → the **second** click also lands in the editor. A `409 slug_conflict` dead-end
  screen means the random-suffix placeholder slug regressed
- [ ] **13.5 (Fix 5)** With an article that has a saved `excerpt`, `seoTitle`, and `seoDescription`:
  delete **all** the text in each field, wait for "Saved", then reload the page **and** check the row
  in SQL → all three are actually empty. If the old values come back, the `|| undefined` coercion
  regressed and the save reported success while discarding the clear

## 14. Admin editor UI (browser)

Needs the section-0 CSRF patch and a console sign-in. Everything here is UX that no test covers.

- [ ] **14.1** `/articles` lists articles with author and status; the All / Draft / Scheduled /
  Published filters each narrow the list
- [ ] **14.2** **New article** → a draft is created and you land on `/articles/<id>` (address bar shows
  a real uuid, not `new`)
- [ ] **14.3** On load, with no cursor in the content area, **no formatting toolbar is visible**
- [ ] **14.4** Select text → a floating toolbar appears anchored to the selection, offering bold,
  italic, underline, strikethrough, link, and heading levels. Click outside → it disappears
- [ ] **14.5** `Ctrl+B` on a selection is identical to the toolbar's bold; `Ctrl+Z` / `Ctrl+Shift+Z`
  undo and redo; Enter and Backspace split and merge blocks
- [ ] **14.6** Type `/` on an empty line → a searchable menu opens. Type `head`, pick **Heading 2** →
  the line becomes an H2 and the `/head` query text is gone
- [ ] **14.7** Open the slash menu, press **Escape** → it closes and the `/` stays as plain text
- [ ] **14.8** Insert each block from the menu: heading, quote, code block, ordered list, unordered
  list, checklist, table, image, divider, video
- [ ] **14.9** Slash-insert an **image**, pick a real JPEG → it uploads through `POST /media` (check the
  network tab) and an image block referencing the returned URL appears. Confirm the document contains
  a **URL**, never a base64 data blob
- [ ] **14.10** Slash-insert an image and pick a **PDF** → the failure is reported to you and **no
  image block is inserted**
- [ ] **14.11** Set a **featured image** in the sidebar → same `POST /media` path, thumbnail appears,
  and the article stores the media id
- [ ] **14.12** Type continuously, then pause → the indicator goes Saving → Saved without any button
  click. Reload → the content is there
- [ ] **14.13** Kill the API mid-typing → the indicator shows an error with a message, not a silent
  failure. Restart, type again → it recovers to Saved
- [ ] **14.14** Edit the **slug** field and blur → it commits. Enter a slug already in use → the inline
  error appears and the field reverts to the stored slug
- [ ] **14.15** Assign and remove categories and tags via the chips → each change autosaves
- [ ] **14.16** **Preview** → a modal shows the article as it will publish; close it and confirm the
  status is unchanged
- [ ] **14.17** **Focus mode** → header and sidebar disappear, canvas stays interactive; exit → both
  return with no content lost
- [ ] **14.18** Dark-mode toggle → the whole editor, sidebar, and modal are legible in both themes,
  and the choice survives a reload
- [ ] **14.19** Publish → the badge flips to `published` and the Publish button becomes Unpublish.
  Delete → confirm dialog, then back to `/articles`
- [ ] **14.20** As a staff member **without** `news.manage`, try Publish → the "You don't have
  permission" banner appears (the UI reacts to the server's 403 rather than pre-computing it)
- [ ] **14.21** `/categories` and `/tags` → add, rename, delete each; a duplicate name shows the
  conflict message; without the matching permission the forbidden banner appears
- [ ] **14.22** Open `/articles/<id>` directly on a cold load → the lazy-loaded editor chunk shows
  "Loading editor…" then resolves. Check the network tab: the editor bundle is **not** in the initial
  chunk on `/articles`

---

## 15. Deliberately not on this list

| Skipped | Why |
|---|---|
| Byte-signature sniffing for each format in isolation | `mediaStorage.test.ts` (11 tests) covers every accepted type, the oversize case, the mismatch case, and the no-residue guarantee. Section 4 keeps only what needs a real filesystem and a real HTTP multipart body. |
| `sanitizeHtml` per-block-type output assertions | `sanitizeHtml.test.ts` (18 tests) is one per block plus disallowed markup. Section 12 keeps only the round-trip-through-the-database cases and the XSS vectors worth seeing with your own eyes. |
| `published_at` transition matrix | `article.service.test.ts` — "published_at lifecycle" (4 tests). Section 6 re-runs it because the transitions now go through a real `UPDATE ... RETURNING`, where a wrong column name is invisible to a fake. |
| `revalidateArticlePaths` never throwing | `revalidate.test.ts` (4 tests) covers network failure and error responses. Item 9.6 keeps the end-to-end version because only a real publish proves the *write* survives. |
| `excludeIds` comma-string parsing | `article.test.ts` (contracts) covers it fully. Items 8.9–8.11 exist for the `notInArray` SQL, not the parsing. |
| Scheduled-publish worker logic | `scheduledPublishWorker.test.ts` (4 tests). Section 10 exists only because time actually passing, and cron actually firing, cannot be faked usefully. |
| `auditAuthorizationDeclarations` passing at boot | `health.routes.test.ts` boots the real `createServer()` with all six new route groups mounted. |
| CSRF mechanics, rate-limit internals, session lifecycle | Covered by add-auth-foundation's suite and its own MANUAL_QA list. |

## 16. Known gaps that survive this list

- **The admin SPA cannot write anything without the local patch in section 0.** This is a real
  product defect, not a test-harness inconvenience: `apiFetch`/`apiUpload` need to send
  `x-csrf-token`. Fix it before shipping the admin UI.
- **There is no admin login page.** `App.tsx`'s `LoginPage` is a stub, and no route is guarded — any
  unauthenticated visitor reaches `/articles` and sees a failed fetch instead of a sign-in screen.
- **No navigation exists** between the article list, categories, and tags — all three are
  URL-only.
- **The public site does not render news yet.** `apps/web/app/news/page.tsx` and `[slug]/page.tsx`
  are placeholders awaiting the `add-web-news-pages` follow-up, so section 9 verifies that
  revalidation is *requested*, not that a page visibly changes.
- **Image resize and alignment** are supported by the sanitizer (`width`, `align`) but no drag handle
  or alignment control is wired in the editor — item 14.8 covers insertion only. The article-editor
  spec's "Insert and resize an image" scenario has no UI to exercise.
- **In-process rate limiting** resets on restart and does not hold across instances (inherited from
  add-auth-foundation; documented in `docs/ARCHITECTURE.md` §13).
- **`articles.search_vector` is deferred** to a follow-up change (tasks.md 2.11) — there is no
  full-text search to test.
