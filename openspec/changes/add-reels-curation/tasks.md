## 0. Prerequisite

`add-home-curation` and `add-news-management-system` are implemented and merged into `main`. The prerequisites below are satisfied; recorded here for traceability rather than as an open gate.

- [ ] 0.1 `app.media` exists and the media upload endpoint accepts images — posters need no new storage work
- [ ] 0.2 `apps/api/src/lib/revalidate.ts` exports `revalidateHomePath`, added by `add-home-curation`, which logs and swallows failures
- [ ] 0.3 `authenticate` + `requirePermission` exist and `news.manage` is seeded by `0000_useful_red_shift.sql`
- [ ] 0.4 Re-read `archive/2026-08-12-add-home-curation/design.md` — "Writes replace the whole list" before writing the replace transaction; its lock ordering is reused verbatim and its two failure modes were found empirically, not theoretically

## 1. Data model

- [ ] 1.1 Add a `reel_provider` pgEnum to `packages/db`: `instagram`, `tiktok`, `youtube`
- [ ] 1.2 Add a `reel_status` pgEnum: `draft`, `published`, `unavailable`
- [ ] 1.3 Add `app.reels` to the Drizzle schema: `id` (uuid pk, default random), `provider` (enum, not null), `external_id` (text, not null), `poster_media_id` (uuid, **not null**, fk → `app.media` `ON DELETE RESTRICT`), `caption` (text), `status` (enum, not null, default `draft`), `created_at`, `updated_at`
- [ ] 1.4 Add `UNIQUE (provider, external_id)` so one source video cannot be stored under two records and thus appear twice in one rail
- [ ] 1.5 Confirm `poster_media_id` is `ON DELETE RESTRICT`, not `CASCADE` — deleting a poster must fail rather than silently leave a reel with no image, which the graceful-degradation requirement depends on
- [ ] 1.6 Add `app.reels_curation`: `reel_id` (uuid, **primary key**, fk → `app.reels` `ON DELETE CASCADE`), `position` (integer, not null, unique), `created_at`
- [ ] 1.7 Confirm `reel_id` is the primary key rather than a surrogate id, so a duplicate entry is structurally impossible instead of merely validated
- [ ] 1.8 Add no `scope` column to `reels_curation` — there is exactly one rail and it applies to the homepage only
- [ ] 1.9 Enable RLS with default deny on both new tables, consistent with every other table in the `app` schema
- [ ] 1.10 Generate and apply a migration via `drizzle-kit` against `DIRECT_URL`
- [ ] 1.11 Confirm the migration seeds **no** rows in `app.permissions` — reels are carried by the existing `news.manage`
- [ ] 1.12 Confirm no column stores a submitted URL

## 2. Provider parsing

- [ ] 2.1 Add a provider table in `packages/contracts` mapping each provider to its URL pattern, its identifier character class, and its embed template
- [ ] 2.2 Instagram: accept `instagram.com/reel/<id>` (and `/reels/<id>`), identifier `^[A-Za-z0-9_-]{5,32}$`
- [ ] 2.3 TikTok: accept `tiktok.com/@<user>/video/<id>`, identifier `^[0-9]{5,32}$`
- [ ] 2.4 YouTube Shorts: accept `youtube.com/shorts/<id>` (and `youtu.be/<id>`), identifier `^[A-Za-z0-9_-]{11}$`
- [ ] 2.5 Implement `parseReelUrl(url) → { provider, externalId } | null` — reject anything that does not match a pattern exactly
- [ ] 2.6 Match the host against an exact allowlist including the `www.` variant; do **not** use `endsWith`, which accepts `evil-instagram.com` and `instagram.com.attacker.net`
- [ ] 2.7 Discard query parameters and fragments, so the same video submitted with different tracking parameters yields one identity
- [ ] 2.8 Implement `buildEmbedUrl(provider, externalId)` from a per-provider literal template, taking scheme and host from code
- [ ] 2.9 Add no configuration path, environment variable, or request field that can introduce a provider
- [ ] 2.10 Unit-test the parser against: each provider's happy path, an unknown host, a lookalike host, a recognized host with a wrong path, an identifier with a path separator, an identifier with a quote, a `javascript:` URL, a protocol-relative URL, and a URL with credentials

## 3. Contracts

- [ ] 3.1 Add a reel create schema: `url` (string), `posterMediaId` (uuid, **required**), `caption` (optional, max length)
- [ ] 3.2 Add a reel update schema: `caption`, `posterMediaId`, `status`
- [ ] 3.3 Add a reel response schema: `id`, `provider`, `externalId`, poster URL, `caption`, `status`, timestamps — and **no** `url` field carrying a stored URL
- [ ] 3.4 Add a public reel item schema: `provider`, `externalId`, poster URL, `caption`. No HTML, no iframe, no embed URL unless the rendering follow-up needs it composed server-side
- [ ] 3.5 Add a reels-curation replace-request schema: an ordered array of reel ids, max 10, min 0
- [ ] 3.6 Reject duplicate ids within the submitted array at the contract boundary
- [ ] 3.7 Ensure the request schema declares **no** `position` field — positions are derived server-side from array order
- [ ] 3.8 Add an admin reels-curation response schema: each entry carries its reel, its ordinal position, the reel's status, and whether it is currently publicly visible

## 4. Reels module — admin library surface

- [ ] 4.1 Scaffold `apps/api/src/modules/reels/` (routes, controller, service, repository, mapper, provider parser)
- [ ] 4.2 Add `POST /admin/reels` declaring `requirePermission('news.manage')` — parse the URL, reject on no match, persist `(provider, externalId)` only
- [ ] 4.3 Reject creation when `posterMediaId` is absent or names no media record
- [ ] 4.4 Translate the `(provider, external_id)` unique violation into a typed `AppError` (`duplicate_reel`) rather than a bare 500
- [ ] 4.5 Add `GET /admin/reels` (list, paginated) and `GET /admin/reels/:id`
- [ ] 4.6 Add `PATCH /admin/reels/:id` for caption, poster, and status — the provider and identifier are immutable after creation
- [ ] 4.7 Add `DELETE /admin/reels/:id`, relying on `ON DELETE CASCADE` to clear any ordering entry
- [ ] 4.8 Call `revalidateHomePath()` when a reel's status crosses the publicly-visible boundary, and on delete of an ordered reel
- [ ] 4.9 Confirm no admin endpoint returns a stored URL for a reel

## 5. Reels module — ordering surface

- [ ] 5.1 Add `GET /admin/reels/curation` declaring `requirePermission('news.manage')`, returning every stored entry in order — including entries whose reels are not publicly visible
- [ ] 5.2 Add `PUT /admin/reels/curation` declaring `requirePermission('news.manage')`, accepting the ordered array of reel ids
- [ ] 5.3 Implement whole-list replacement in a **single transaction**, in this exact statement order: `SELECT id FROM app.reels WHERE id IN (…) FOR KEY SHARE` → `LOCK TABLE app.reels_curation IN EXCLUSIVE MODE` → `DELETE` all rows → `INSERT` one row per id with `position` set to the array index
- [ ] 5.4 Do **not** take the table lock first — `add-home-curation` reproduced a `40P01` deadlock against live Postgres 16 when a concurrent reel delete held a row lock while the replace held the table
- [ ] 5.5 Do **not** omit the table lock — `add-home-curation` reproduced a `23505` against live Postgres when two overlapping replaces both deleted before either inserted
- [ ] 5.6 Use the `FOR KEY SHARE` result as the existence check, rejecting a submitted id that names no reel there rather than by translating a `23503`
- [ ] 5.7 Permit reels in any status to be ordered — do **not** reject drafts or unavailable reels at write time
- [ ] 5.8 Add no endpoint that moves, inserts, or removes an individual entry
- [ ] 5.9 Call `revalidateHomePath()` after a successful write, logging and swallowing failures
- [ ] 5.10 Confirm the write does not revalidate `/news` or any `/news/<slug>` path

## 6. Reels module — public surface

- [ ] 6.1 Add `GET /reels` declaring `requirePublic()`, mounted bare to match the existing `/articles`, `/categories`, `/tags` convention
- [ ] 6.2 Load ordering entries in stored order and filter to `published` reels
- [ ] 6.3 Return one flat ordered array of public reel items
- [ ] 6.4 Issue **no** backfill query — an ordering shorter than the rail returns fewer items, and an empty ordering returns an empty array
- [ ] 6.5 Confirm the response carries no HTML, iframe, or script

## 7. Admin UI

- [ ] 7.1 Add a reel library screen to `apps/admin`: list, create (URL + poster upload + caption), edit, delete
- [ ] 7.2 On create, show the parsed provider and identifier back to the editor before saving, so a mistyped URL is caught by a human rather than by a 400
- [ ] 7.3 Surface `duplicate_reel` as "this video is already in the library" with a link to the existing reel
- [ ] 7.4 Make the poster field required in the form, with the existing media upload control
- [ ] 7.5 Add a status control with the three states, labelling `unavailable` as "source video no longer available"
- [ ] 7.6 Add a rail ordering screen: drag-and-drop over the library, local state only, no request per drag
- [ ] 7.7 Badge each entry that is not currently publicly visible, with its status
- [ ] 7.8 Submit the complete resulting order as one `PUT` on save; disable adding past 10 entries client-side
- [ ] 7.9 Support clearing the rail entirely, and explain in the empty state that the homepage shows no reels rail at all
- [ ] 7.10 Do **not** render a live provider embed in the admin preview — show the poster, consistent with the facade rule

## 8. Tests

- [ ] 8.1 Parser unit tests per task 2.10
- [ ] 8.2 Contract tests: reel schemas, replace-request max/min/duplicates, absence of a `position` field
- [ ] 8.3 Permission tests: each admin endpoint rejects without `news.manage` and rejects anonymously
- [ ] 8.4 Replacement tests: overwrite, clear, position derivation, rejected write leaves the ordering intact
- [ ] 8.5 Concurrency test: two overlapping replaces both succeed and the result matches exactly one submitted collection in full
- [ ] 8.6 Concurrency test: a replace concurrent with a reel delete produces no `40P01` and no `23505`
- [ ] 8.7 Visibility tests: draft and unavailable reels are ordered but absent from public output; restoring status restores position
- [ ] 8.8 Cascade test: deleting a reel removes its ordering entry and leaves the remaining relative order intact
- [ ] 8.9 Backfill-absence test: a short ordering returns fewer items; an empty ordering returns an empty array
- [ ] 8.10 Public-shape test: the public response contains no HTML, iframe, or script, and no stored URL
- [ ] 8.11 Regression test: article body video nodes still render as inert links, and `sanitizeHtml.ts` is unmodified
- [ ] 8.12 Regression test: the accepted media type list still rejects `video/mp4`

## 9. Completion

- [ ] 9.1 `pnpm build`
- [ ] 9.2 `pnpm lint`
- [ ] 9.3 `pnpm test`
- [ ] 9.4 `pnpm typecheck` — no TypeScript errors, no `any`
- [ ] 9.5 Confirm `apps/web` and `apps/api/src/lib/sanitizeHtml.ts` are untouched by this change
