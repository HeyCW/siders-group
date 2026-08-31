## 1. Media: per-kind limits and MP4 recognition

- [x] 1.1 Replace `MEDIA_MAX_BYTES` in `apps/api/src/config/env.ts` with `MEDIA_MAX_IMAGE_BYTES`
      (default 10 MiB) and `MEDIA_MAX_VIDEO_BYTES` (default 200 MiB).
- [x] 1.2 Add an MP4 entry to `SIGNATURES` in `apps/api/src/lib/mediaStorage.ts`: recognize the
      ISO-BMFF `ftyp` box (same box the AVIF signature already reads) and accept it as `video/mp4`
      when the brand is an MP4 brand (`isom`, `iso2`, `mp41`, `mp42`, `avc1`, etc.), distinct from
      the AVIF brand check already there.
- [x] 1.3 Add a `MediaMimeType` union entry for `video/mp4` in `packages/contracts` (wherever the
      existing image MIME union is defined) and thread it through `mediaStorage.ts`'s `StoredFile`
      typing.
- [x] 1.4 Update `storeUpload` to look up the size limit by sniffed kind (image vs. `video/mp4`)
      rather than a single `MEDIA_MAX_BYTES`, rejecting with the existing `file_too_large` error
      when the kind-specific limit is exceeded.
- [x] 1.5 Unit-test: an MP4 upload at/under `MEDIA_MAX_VIDEO_BYTES` is accepted; an image at a size
      between the two limits is rejected (not granted the video allowance); `video/webm` and
      `video/quicktime` payloads are rejected regardless of size; an AVIF and an MP4 sharing the
      same leading container bytes are each identified correctly by brand.

## 2. Media: streaming upload

- [x] 2.1 Switch `createUploadMiddleware` (`apps/api/src/modules/media/media.routes.ts`) from
      `multer.memoryStorage()` to `multer.diskStorage()`, writing into a temp subdirectory under
      `MEDIA_STORAGE_PATH` (e.g. `.tmp/`), with `limits.fileSize` set to
      `Math.max(MEDIA_MAX_IMAGE_BYTES, MEDIA_MAX_VIDEO_BYTES)`.
- [x] 2.2 Change `storeUpload`'s signature from `{ buffer, declaredMime }` to a temp file path (or a
      readable handle) plus `declaredMime`: read only the leading bytes needed for sniffing, then
      `rename()` the temp file into its final dated-shard path instead of `writeFile`-ing a buffer.
- [x] 2.3 On any rejection path in `storeUpload` (empty file, size, unsupported type, content-type
      mismatch) and on a failed final `rename`, delete the temp file before throwing.
- [x] 2.4 Ensure the temp subdirectory is created on startup alongside the existing
      `ensureMediaStorageDir` call, and is excluded from anything that lists or serves
      `MEDIA_STORAGE_PATH` publicly (it must not be reachable via `mediaFileRoutes`).
- [x] 2.5 Update `media.service.ts` / `media.controller.ts` call sites for the new `storeUpload`
      signature.
- [x] 2.6 Update `mediaStorage.ts`'s and `media.service.test.ts`'s tests: replace buffer fixtures
      with temp-file fixtures; add a test asserting no temp file survives a rejected upload
      (including one that fails partway through, if that path is reachable in tests) and none
      survives a failed rename.
- [x] 2.7 Update the `nosniff` comment in `media.routes.ts` (it currently asserts "every stored file
      is one of the allowlisted image types") to also account for MP4.

## 3. Database: guide pick video column

- [x] 3.1 Add `videoMediaId: uuid('video_media_id').references(() => media.id, { onDelete:
      'restrict' })` (nullable at first) to `packages/db/src/schema/guidePicks.ts`, documented
      alongside `photoMediaId`'s existing comment as the pick's poster/video pair.
- [x] 3.2 Generate the migration; hand-edit it into three statements in this order: (a) add
      `video_media_id` nullable, (b) `DELETE FROM app.guide_picks;`, (c) `ALTER COLUMN
      video_media_id SET NOT NULL`. Add a migration-file comment recording why step (b) is safe (no
      seed data references `guide_picks`; no video capability existed before this migration) and
      that it is destructive against any pre-existing production rows (see design.md - "Migration:
      clear guide_picks").
- [x] 3.3 Update the Drizzle schema's TypeScript type for `videoMediaId` to non-nullable to match.
- [ ] 3.4 Before running this migration against any environment with real data, confirm with
      whoever owns that environment whether existing guide picks need to be exported first — this
      is a manual pre-step, not something the migration automates (design.md - Risks).

## 4. API: guide pick video support

- [x] 4.1 Add `videoMediaId: z.string().uuid()` (required) to `guidePickCreateRequestSchema` in
      `packages/contracts/src/guidePick.ts`.
- [x] 4.2 Leave `videoMediaId` out of `guidePickUpdateRequestSchema`'s optional fields being
      settable to a cleared/null value — it may be updated to a new media id but never cleared,
      matching "A guide pick cannot be left without its video."
- [x] 4.3 Add `videoUrl: z.string()` to `guidePickResponseSchema` and to `publicGuidePickSchema`.
- [x] 4.4 Update `GuidePickRow`, `CreateGuidePickInput`, `UpdateGuidePickInput` in
      `guidePick.repository.ts` to carry `videoMediaId` / a joined `videoStoragePath`, mirroring the
      existing `photoMediaId` / `photoStoragePath` join.
- [x] 4.5 Update `guidePick.repository.ts`'s `create`/`update`/`list`/`findById` queries to join
      `media` a second time (aliased) for the video reference, and reject creation when
      `videoMediaId` does not reference an existing media row (mirrors the existing photo check).
- [x] 4.6 Reject in the service/repository layer when `videoMediaId` resolves to a media row whose
      `mime` is not `video/mp4` (and symmetrically, when `photoMediaId` resolves to a video) —
      "Photo must be an image, not a video" / "Video must be a video, not an image."
- [x] 4.7 Update `guidePick.mapper.ts` to derive `videoUrl` the same way `photoUrl` is derived
      (public URL composed from the joined storage path).
- [ ] 4.8 Add the `ON DELETE RESTRICT` guard test: deleting a media row referenced as a guide pick's
      video is refused; deleting one referenced as its photo continues to be refused (existing
      behavior, now doubly true).
- [x] 4.9 Update `guidePick.service.test.ts`, `guidePick.repository.test.ts`, and
      `guidePick.service.revalidation.test.ts` fixtures to include a video media row wherever a
      guide pick is created.

## 5. Web: grouped video rendering

- [x] 5.1 In `apps/web/lib/anakUsaha.ts`-equivalent presentation layer (or a new
      `apps/web/lib/guidePicks.ts`), add a pure function that takes the flat ordered
      `PublicGuidePick[]` and returns city groups: bucket by `city.trim().toLowerCase()`, keep the
      first-seen raw `city` as the label, keep first-appearance order for group order and stored
      order within a group (design.md - "City grouping").
- [x] 5.2 Unit-test the grouping function: mixed case/whitespace city values collapse into one
      group; group order follows first appearance, not alphabetical; a single-city input yields one
      group; empty input yields no groups.
- [x] 5.3 Update `GuideOfWeek.tsx` to render one labeled group per city (heading + grid), each pick
      showing a `<video>` element (`preload="none"`, no `poster`, `src={videoUrl}`) that begins
      playback only on user activation, replacing the always-visible `<img>`.
- [x] 5.4 Ensure only one pick plays at a time: activating a pick's video pauses/resets any other
      currently-playing pick in the section.
- [x] 5.5 Delete `apps/web/components/home/ReelsRail.tsx` and `ReelsRail.test.tsx`; remove its
      import and usage from `apps/web/app/page.tsx`.
- [x] 5.6 Remove `getReels` and the `PublicReelItem` import from `apps/web/lib/api.ts`; remove the
      `getReels` call from `apps/web/app/page.tsx`'s `Promise.all`.
- [x] 5.7 Update/replace `GuideOfWeek`'s existing tests for the new grouped, video-rendering markup.

## 6. Admin: video upload on the guide pick form

- [x] 6.1 In `apps/admin/src/pages/GuidePicksPage.tsx`, add a video file input alongside the
      existing photo input, following the same pattern (`videoMediaId`/`videoPreviewUrl`/
      `videoUploadError` state, upload-on-select, required before create is enabled).
- [x] 6.2 Restrict the video input's accepted type to MP4 client-side (as a UX hint only — the
      server sniff remains the actual boundary) and surface the server's rejection message when a
      non-MP4 or oversized file is selected.
- [x] 6.3 Update the edit form to allow replacing the video (optional on edit, following the
      existing "Replace photo (optional)" pattern) while never allowing it to be cleared to empty.
- [x] 6.4 Update `apps/admin/src/lib/*GuidePick* API client and `GuidePicksPage.test.tsx` for the
      new required field and upload flow.

## 7. Remove reels-curation

- [x] 7.1 Delete `apps/api/src/modules/reels/` in full (all 14 files).
- [x] 7.2 Delete `packages/contracts/src/reel.ts`, `reel.test.ts`, `reelProvider.ts`,
      `reelProvider.test.ts`, `reelsCuration.ts`, `reelsCuration.test.ts`; remove their exports from
      `packages/contracts/src/index.ts`.
- [x] 7.3 Delete `packages/db/src/schema/reels.ts` and `reelsCuration.ts`; remove their exports from
      `packages/db/src/schema/index.ts`.
- [x] 7.4 Generate a migration dropping the `reels_curation` and `reels` tables and the
      `reel_provider` and `reel_status` enums, in dependency order (curation join table before the
      library table).
- [x] 7.5 Delete `apps/admin/src/pages/ReelLibraryPage.tsx`, `ReelLibraryPage.test.tsx`,
      `ReelsCurationPage.tsx`, `apps/admin/src/lib/reelsApi.ts`, `reelStatusStyles.ts`.
- [x] 7.6 Remove the `/reels` and `/reels-curation` routes and their imports from
      `apps/admin/src/App.tsx`; remove both sidebar entries (and the now-unused `IconReelsLibrary` /
      `IconReelsCuration`) from `apps/admin/src/components/Sidebar.tsx`.
- [x] 7.7 Remove the reels route mounts (`/admin/reels-curation`, `/admin/reels`, `/reels`) and the
      `reelRoutes`/`reelsCurationRoutes`/`publicReelsRoutes` import from `apps/api/src/server.ts`.
- [x] 7.8 Remove the `reels` half of `curationIntegrity` from `packages/contracts/src/dashboard.ts`
      (`curationIntegrityCountsSchema` usage for reels; keep `home`), and from
      `apps/api/src/modules/analytics/analytics.repository.ts` (drop the `reelsCuration`/`reels`
      query and the `isReelPubliclyVisible` import, which moves or is deleted with the reels
      module — check whether `analytics.repository.ts` needs its own copy of the visibility
      predicate or whether it can be deleted outright).
- [x] 7.9 Update `apps/admin/src/pages/DashboardPage.tsx`'s "Homepage & reels integrity" tile to
      "Homepage integrity" showing only the `home` counts; drop the reels column from its layout.
- [x] 7.10 Delete `apps/web/components/home/ReelsRail.tsx`/`.test.tsx` if not already removed in
      task 5.5 (ordering note: do this step last so the homepage change in section 5 has already
      stopped depending on it).
- [x] 7.11 Repo-wide grep for `reel`/`Reel` (case-insensitive) outside `openspec/changes/archive/`
      and confirm zero remaining references in `apps/`, `packages/`.

## 8. Verification

- [x] 8.1 Run the full test suite (`apps/api`, `apps/admin`, `apps/web`, `packages/contracts`,
      `packages/db`) and fix fallout.
- [x] 8.2 Type-check the whole workspace; the removed `reels` exports will surface any straggling
      references the grep in 7.11 missed.
- [ ] 8.3 Manually verify end-to-end: upload an MP4 + poster as a new guide pick in the admin UI,
      confirm it appears grouped correctly on the homepage under its city, confirm video seeking
      works (range requests), confirm an oversized or non-MP4 upload is rejected with a clear error,
      confirm the reels admin nav entries and homepage reels rail are gone.
- [x] 8.4 Run `openspec validate self-hosted-guideline-videos --strict` before archiving.

## 9. Follow-up: the photo becomes optional

The live backend is `apps/api-laravel`, not the Node/Drizzle `apps/api` — see design.md addendum
below. Both are updated for parity; the Laravel side is the one actually deployed.

- [x] 9.1 Laravel: new migration
      `2026_08_31_110001_make_guide_pick_photo_optional.php` runs `MODIFY photo_media_id CHAR(36)
      NULL` (additive, no data loss — existing rows keep their photo). Applied to the local dev DB.
      `StoreGuidePickRequest.photoMediaId` changed from `required` to `sometimes`;
      `GuidePickService::create` defaults the column to `null` when omitted;
      `GuidePickController::shape()` returns `photoUrl: null` when the pick has no photo (mirrors
      the existing `logoUrl`/`featuredMedia` nullable-media pattern already used by
      `PartnerController`/`ArticlePresenter`).
      Node/Drizzle parity (not the live path, kept in sync for the shared workspace type-check):
      `packages/db/src/schema/guidePicks.ts` drops `.notNull()` from `photoMediaId`; no new
      `db/migrations/*.sql` was generated since that migration history is stale relative to the
      Laravel schema (guide_picks' own video-column migration was never added there either).
- [x] 9.2 `packages/contracts/src/guidePick.ts`: `photoMediaId` optional in
      `guidePickCreateRequestSchema`; `photoUrl` nullable in `guidePickResponseSchema` and
      `publicGuidePickSchema`. Rebuilt (`npm run build`) so consuming apps pick up the change.
- [x] 9.3 `apps/api/src/modules/guidePicks/guidePick.repository.ts`: the `photoMediaId` join is now
      a `leftJoin`; `photoStoragePath`/`photoMediaId` are nullable on `GuidePickRow`.
- [x] 9.4 `apps/api/src/modules/guidePicks/guidePick.mapper.ts`: derives `photoUrl` only when
      `photoStoragePath` is present, `null` otherwise.
- [x] 9.5 `apps/admin/src/pages/GuidePicksPage.tsx`: removed the photo upload field from the create
      form and the "Replace photo" field from the edit form; dropped `photoMediaId` from
      `canCreate`; guarded the list row's photo thumbnail (`pick.photoUrl` may now be `null`).
- [x] 9.6 Updated `guidePick.service.test.ts` (repository fake) and `GuidePicksPage.test.tsx`
      (create-form tests, no-photo-field assertion) to match. `guidePick.repository.test.ts` and
      `guidePick.service.revalidation.test.ts` needed no changes and still pass.
- [x] 9.7 Ran the affected test suites (`apps/api` guidePicks module, `apps/admin`
      `GuidePicksPage.test.tsx`, `apps/web` `GuideOfWeek`/`guidePicks` tests) and `tsc --noEmit` for
      `packages/contracts`, `apps/admin`, `apps/web`, `apps/api` — all clean. Ran
      `openspec validate self-hosted-guideline-videos --strict` — valid. No PHPUnit tests exist for
      `GuidePick` to update; `php -l` checked the edited/new PHP files.
