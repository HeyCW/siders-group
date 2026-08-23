## Why

The "Siders Guideline of the Week" section presents city guides as still photographs, but the
guideline content Siders actually produces is short vertical video. The section therefore shows a
flattened, less useful version of the real thing.

Referencing the videos from Instagram — the mechanism `reels-curation` already provides — was
considered and rejected. A referenced video carries the provider's chrome and tracking into the
page, and it vanishes without warning when the source post is deleted or made private, which is
why `reels-curation` needed an `unavailable` status at all. Serving the files ourselves makes the
guideline durable, free of third-party surveillance, and presentable in Siders' own layout.

Doing this makes the existing reels rail redundant: it would be a second, weaker vertical-video
rail on the same homepage. It is removed rather than left to compete.

## What Changes

- **BREAKING** A guide pick SHALL require a self-hosted video. Its existing photo is retained and
  stays required, but is redefined as the video's poster.
- **BREAKING** Existing guide picks cannot satisfy the new requirement — no video exists anywhere
  in the system to backfill them with. Every guide pick present at migration time is either given
  a video by hand beforehand or removed. There is no automatic backfill.
- The media capability accepts video files in addition to images, under a **separate, larger size
  limit** (images stay at 10 MiB; video is capped at 200 MiB). A single shared limit is rejected:
  raising it for video would also authorize a 200 MiB image.
- Uploads are no longer buffered whole in memory. A video-sized upload held in RAM would exhaust a
  modest host, so uploads stream to disk and are validated there. Consequently, a rejected upload
  must now actively clean up the partial file it has already written.
- The public guideline section groups its videos by city. Grouping is derived from the existing
  free-text `city` value — no fixed set of cities, no enum. Group order follows the order in which
  each city first appears in the existing pick ordering, so editors control it through the reorder
  endpoint they already use.
- The number of videos stays unbounded by count, as the guide-pick list already is. It is bounded
  only by storage.
- **BREAKING** The reels capability is removed in full: its library, its ordering, its admin
  screens, its public endpoint, its homepage rail, and its two database tables.
- **BREAKING** The admin dashboard's "Homepage & reels integrity" tile loses its reels half.

## Capabilities

### New Capabilities

None. This change reshapes existing capabilities and removes one.

### Modified Capabilities

- `media-management`: accepted types extend to video; the single maximum-size requirement splits
  into per-kind limits; upload handling becomes streaming, which changes what "leaves no residue"
  must guarantee on rejection.
- `guide-of-the-week-management`: a guide pick requires a video; the required photo is redefined as
  that video's poster; public output carries the video URL and the grouping-relevant city.
- `web-public-site`: the homepage's guideline section renders grouped video with poster-first
  playback; every reels-rail requirement is removed.
- `reels-curation`: removed entirely.

## Impact

**Removed** — `apps/api/src/modules/reels/` (14 files); `packages/contracts/` reel, reelProvider,
reelsCuration and their tests; `packages/db/src/schema/` reels.ts and reelsCuration.ts;
`apps/admin/` ReelLibraryPage, ReelsCurationPage, reelsApi, reelStatusStyles;
`apps/web/components/home/ReelsRail.tsx`. Note that `apps/api/src/lib/replaceOrdering.ts` is shared
with other capabilities and is retained.

**Unwired** — `apps/api/src/server.ts`; `apps/admin/src/App.tsx` and `Sidebar.tsx`;
`apps/web/lib/api.ts`; `apps/web/app/page.tsx`; `apps/api/src/modules/analytics/analytics.repository.ts`
and `apps/admin/src/pages/DashboardPage.tsx` (the integrity tile).

**Reworked** — `apps/api/src/lib/mediaStorage.ts` (its `storeUpload` takes a buffer today and must
take a streamed file instead, along with its tests); `apps/api/src/modules/media/media.routes.ts`
(memory storage, the single size limit, and the `nosniff` justification that assumes every stored
file is an image); `apps/api/src/config/env.ts` (per-kind size limits).

**Database** — guide picks gain a required video reference; the `reels` and `reels_curation` tables
drop, along with the `reel_provider` and `reel_status` enums.

**Deployment** — the repository currently contains no deployment configuration. Two limits that
were previously irrelevant now govern whether the feature works at all: the reverse proxy's request
body cap (nginx defaults to 1 MiB, which would reject every video) and the size of the media
volume. Video also makes the storage footprint an order of magnitude larger than the image-only
footprint it replaces.

**Accepted risk** — container sniffing identifies a file as MP4 but cannot see the codec inside it,
so a valid MP4 carrying HEVC, AV1, or ProRes will pass validation and fail to play for many
visitors. This change does not add codec inspection; it is handled as editorial guidance.
