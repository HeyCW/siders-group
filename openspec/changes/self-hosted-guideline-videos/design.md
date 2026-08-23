## Context

Media upload today (`apps/api/src/lib/mediaStorage.ts`, `apps/api/src/modules/media/media.routes.ts`)
buffers the whole file in memory via `multer({ storage: multer.memoryStorage() })`, sniffs its
magic bytes, and writes it in one `writeFile` call. `MEDIA_MAX_BYTES` (default 10 MiB) is a single
number consulted twice: once as multer's `limits.fileSize`, once inside `storeUpload`. Static
serving is `express.static(MEDIA_STORAGE_PATH)` behind a `nosniff` header, justified in a comment by
"every stored file is one of the allowlisted image types."

`guide_picks` (`packages/db/src/schema/guidePicks.ts`) already models everything this change needs
except the video: free-text `city`, a required `photoMediaId` (`ON DELETE RESTRICT`), a plain
`sortOrder` integer column (not a separate ordering table — reorder is a per-row `UPDATE`, see
`guidePick.repository.ts` `reorder()`), and no maximum-count constraint. It does not use
`replaceOrdering.ts`; that helper's delete-and-reinsert pattern belongs to `home_curation` and
`reels_curation`, which are join tables. Removing `reels_curation` leaves `home_curation` as the
helper's sole remaining caller, so `replaceOrdering.ts` itself is untouched.

`reels-curation` is referenced from `analytics.repository.ts` (the "Homepage & reels integrity"
dashboard tile) and from `apps/web/app/page.tsx` — both need unwiring, not just deletion of the
`reels` module.

See `proposal.md` for why self-hosting was chosen over referencing Instagram, and for the full list
of removed and reworked files.

## Goals / Non-Goals

**Goals:**
- Stream uploads to disk instead of buffering in memory, so a 200 MiB video upload does not hold
  200 MiB of Node heap.
- Distinguish image vs. video maxima without a second upload pipeline — one route, one validation
  path, kind-dependent limits.
- Serve stored video with HTTP range support so the browser's native seek bar works.
- Group guide picks by city in the API response shape the frontend consumes, without introducing a
  new stored concept for "group."
- Remove `reels-curation` cleanly: no dangling import, no orphaned dashboard tile, no orphaned enum.

**Non-Goals:**
- Video transcoding, thumbnail/poster extraction from the video, or codec validation beyond
  container-brand sniffing. The poster stays a separately-uploaded, admin-supplied image (see
  `guide-of-the-week-management` spec — "A guide pick requires a photo").
- Object storage (S3/R2) migration. `MEDIA_STORAGE_PATH` stays a local filesystem path; this is the
  same simplification the original media-management design already made, now under more storage
  pressure but not a different architecture.
- CDN or reverse-proxy configuration. The proposal flags the nginx body-size default as a
  deployment concern; this design does not ship an nginx config because none exists in the repo
  today to modify.
- A UI or endpoint for reassigning a guide pick's city in bulk, or for renaming a city across every
  pick that uses it. Each pick's city is edited individually, as today.

## Decisions

### Streaming upload: `multer.diskStorage` to a temp file, then rename

**Decision**: Replace `multer.memoryStorage()` with `multer.diskStorage()` writing into a temp
subdirectory under `MEDIA_STORAGE_PATH` (e.g. `MEDIA_STORAGE_PATH/.tmp/`). `storeUpload` stops
taking a `Buffer` and instead takes the temp file's path plus its size (already known from `fs.stat`
or multer's own report). It reads only the leading bytes it needs for sniffing, then `rename()`s the
temp file into its final dated-shard location — a same-filesystem rename, so it is atomic and does
not re-copy the file.

**Why over alternatives**:
- *Keep `memoryStorage`, just raise the limit* — rejected outright; this is the OOM path the
  proposal names as the reason this refactor exists at all.
- *Stream-sniff without ever touching disk (peek at the first N bytes from a `Transform` stream,
  reject before the rest arrives)* — appealing for the reject-fast case, but Express/multer's
  `busboy` layer has already started consuming the request stream by the time application code sees
  any bytes; cleanly aborting mid-stream and guaranteeing no partial write reaches disk anywhere in
  the pipeline is more fragile than accepting a temp file and deleting it on rejection. The
  "rejected uploads leave no residue" requirement is satisfied by *cleanup*, not by *avoidance*.
- *A dedicated object-storage service* — non-goal; out of scope for this change.

**Consequence for the spec**: this is why `media-management`'s "Rejected uploads leave no residue"
gained the "even when bytes were already written to intermediate storage" clause, and why a new
requirement ("An upload is not held entirely in memory") exists — it is the externally observable
promise this decision makes.

### Per-kind size limit, enforced after sniffing

**Decision**: `env.ts` gains `MEDIA_MAX_IMAGE_BYTES` (default 10 MiB, replacing the old
`MEDIA_MAX_BYTES` name) and `MEDIA_MAX_VIDEO_BYTES` (default 200 MiB). Multer's `limits.fileSize` is
set to `Math.max(MEDIA_MAX_IMAGE_BYTES, MEDIA_MAX_VIDEO_BYTES)` — an outer bound during transfer,
before the kind is known. `storeUpload` sniffs first, then checks the sniffed kind's own limit and
rejects (deleting the temp file) if exceeded.

**Why over alternatives**:
- *Two separate multer instances / two routes (`/media/image`, `/media/video`)* — rejected: the
  client would have to know the kind before uploading, duplicating the sniff-is-the-source-of-truth
  principle the existing spec already establishes ("Real content type is determined by inspecting
  file content", not by the client's claim).
- *One shared max at the video ceiling* — rejected per your decision; a 200 MiB image is not a
  requirement anyone asked for and weakens the image-size guarantee for no benefit.

### AVIF/MP4 disambiguation by ISO-BMFF brand

**Decision**: Both `image/avif` and `video/mp4` use the ISO base media file format container
(`ftyp` box). The existing AVIF sniffer already reads the brand at bytes 8–12 (`mediaStorage.ts:73-79`)
and checks for `avif`/`avis`. The MP4 sniffer added by this change reads the same box and checks for
an MP4 brand (`isom`, `iso2`, `mp41`, `mp42`, `avc1`, among others) — same mechanism, disjoint
brand sets, so `sniffMimeType` gains one more entry in the existing `SIGNATURES` array rather than a
parallel code path.

**Why over alternatives**: A "check file extension" or "trust declared Content-Type for video"
shortcut was considered and rejected on the same grounds `media-management` already rejects it for
images — the client-declared type is an unverified hint by existing, unmodified requirement.

### No codec inspection

**Decision**: Accept any file whose container brand identifies it as MP4. Do not parse `moov`/`trak`
boxes to identify the video/audio codec inside.

**Why**: Real codec inspection means either shelling out to `ffprobe` (a new binary dependency,
a new failure mode, meaningfully more upload latency) or hand-rolling MP4 box parsing far beyond
brand-sniffing. Given this is an internal admin tool uploading editorial content the team controls
end-to-end — not user-generated content from adversarial uploaders — the risk is an editor
uploading an unplayable file and finding out when they preview it, not a security exposure. Recorded
as an accepted risk in the proposal and as a spec requirement ("Playability is not guaranteed by
acceptance") so it is a documented decision rather than a silent gap.

### Range requests via `express.static`, not a hand-rolled handler

**Decision**: Keep serving media through `express.static(MEDIA_STORAGE_PATH)`
(`media.routes.ts:101`). `express.static` (via `send`) already implements conditional GET and
`Range`/`Accept-Ranges` support for any file on disk — no code change is needed on the serving side
at all. The only serving-side change is the `nosniff` comment, which needs updating because "every
stored file is an image" stops being true; the header itself is still correct because
`Content-Type` continues to come from a verified server-side mapping (the sniffed extension), never
from an uploader's claim.

**Why over alternatives**: A custom range-handling route was the obvious first instinct, but
`express.static` already does this correctly and rewriting it would be pure risk for no capability
gain.

### `mime@1.6.0` already maps `.mp4`/`.webm` — the AVIF landmine does not repeat

**Decision**: No `express.static.mime.define()` call is needed for video, unlike the one already
present for AVIF (`media.routes.ts:89`). Confirmed by inspecting the installed `mime@1.6.0` table
directly: `video/mp4` → `mp4`, `mp4v`, `mpg4` is already present. Noted here so a future reader does
not go looking for a video equivalent of that AVIF fix and wonder why it is missing.

### `videoMediaId`: required, `ON DELETE RESTRICT`, mirroring `photoMediaId`

**Decision**: Add `videoMediaId: uuid('video_media_id').notNull().references(() => media.id, {
onDelete: 'restrict' })` to `guide_picks`, alongside the existing `photoMediaId` column (kept,
unrenamed — its column name stays `photo_media_id`; only its role is redocumented as "poster").
`media-management` gains a matching guard so a media row referenced as a guide pick's video cannot
be deleted while referenced — the same protection `photoMediaId` already has.

**Why over alternatives**:
- *Nullable `videoMediaId` with a "pending" pick state* — rejected per your decision (B: NOT NULL,
  no backfill path). A nullable column would let a videoless pick exist indefinitely; the spec
  ("Guide picks predating the video requirement do not survive") requires the opposite.
- *A new table for guide-pick media, generalizing photo+video into rows* — over-engineering for two
  fixed, always-present references; `partners.logoMediaId` and the existing `photoMediaId` already
  establish the one-column-per-role convention this follows.

### Migration: clear `guide_picks` rather than attempt a backfill

**Decision**: The migration that adds `video_media_id NOT NULL` is preceded by
`DELETE FROM app.guide_picks;` in the same migration file. There is no video media anywhere in the
system to backfill from (confirmed: no seed data references `guide_picks`, and no video upload
capability existed before this change), so a backfill step would have nothing to backfill from —
this is not a shortcut, it is the only option consistent with your decision.

**Operational note for whoever runs this**: if the production database has live guide picks at
migration time, they are deleted by this migration. Re-creating them with videos is a manual,
post-migration admin task, not something this change automates.

### City grouping: computed in the API response, not stored

**Decision**: The public guide-pick endpoint's response gains each entry's `city` (already true
today — no shape change needed there). Grouping into city buckets happens in
`apps/web`, immediately before rendering: a single pass over the flat ordered array that
buckets by `city.trim().toLowerCase()` as the group key while keeping the first-seen raw `city`
string as the display label and the first-seen index as the group's sort position.

**Why over alternatives**:
- *A `citySlug` or `cityGroupId` column, computed at write time* — rejected: it duplicates
  information already derivable from `city` and reintroduces exactly the kind of stored redundancy
  `web-public-site`'s new requirement explicitly rules out ("The endpoint SHALL return a single flat
  ordered collection... grouping is a presentation concern of the consuming page").
- *Group server-side, in the API response* — rejected for the same reason: it would make the API
  respond differently depending on how a frontend wants to render, and there is exactly one
  consumer of this endpoint.

## Risks / Trade-offs

- **[Risk]** A migration that runs against a production database with real guide picks silently
  deletes them. → **Mitigation**: called out explicitly above and in `tasks.md`'s migration step;
  the task list requires confirming (or exporting) existing guide-pick content before this
  migration runs, as a manual pre-step outside the migration file itself.
- **[Risk]** 200 MiB per video, unbounded pick count, is a materially larger storage footprint than
  this system has managed before, and there is no deployment config in this repo defining disk size
  or retention. → **Mitigation**: none implemented by this change; flagged in the proposal as an
  accepted operational gap. Storage exhaustion fails uploads (disk full → `ENOSPC` on write), it
  does not corrupt existing data.
- **[Risk]** An unplayable-codec MP4 passes validation and an editor only discovers it by previewing
  the published page. → **Mitigation**: accepted per the "No codec inspection" decision above;
  mitigated socially (editorial guidance: export H.264/AAC) rather than technically.
- **[Trade-off]** Removing `reels-curation` removes the `unavailable` link-rot status pattern from
  the codebase entirely. Self-hosted video cannot "go unavailable" the way a third-party post can
  (the file is either present on disk or it isn't, and a `RESTRICT` delete already prevents the
  reference from dangling), so nothing replaces it — this is intentional, not an oversight.

## Migration Plan

1. Add `MEDIA_MAX_IMAGE_BYTES` / `MEDIA_MAX_VIDEO_BYTES` to `env.ts`; keep the old
   `MEDIA_MAX_BYTES` name out of the schema entirely rather than aliasing it, since every caller of
   it is touched by this change anyway.
2. Ship the streaming-upload rework (`mediaStorage.ts`, `media.routes.ts`) and its MP4 sniffing
   entry independently of the schema change — it is backward compatible with image-only uploads and
   can be verified on its own first.
3. Ship the `guide_picks` migration: add `video_media_id` nullable, `DELETE FROM app.guide_picks`,
   then alter the column to `NOT NULL` — done as three statements in one migration file so the
   column never spends any deployed time in a nullable state that the application code is allowed
   to rely on.
4. Ship the API/contract/admin/web changes for video + grouping.
5. Remove `reels-curation` last: its own admin screens and public endpoint can be deleted the moment
   nothing links to them, which is only true after step 4's homepage change ships.

**Rollback**: Steps 1–2 roll back by redeploying the previous API build; no data was destroyed. Step
3 is not reversible in the sense of recovering deleted rows — rolling back the code after step 3 has
run does not restore the deleted guide picks. Steps 4–5 roll back by redeploying the previous
API/admin/web builds; the removed reels tables are not needed by the rolled-back code, so no
"un-drop" is required unless the drop migration itself must be reverted (it can be, as a separate
down-migration, restoring empty tables — not their prior data).
