## Why

A reel's poster is currently required at creation, but a reel never actually needs one to be
playable: the video itself is a third-party embed (Instagram/TikTok/YouTube iframe) built from the
parsed `(provider, externalId)` identity, mounted only when a visitor clicks the rail tile. The
poster is purely the pre-activation thumbnail shown on that tile. Requiring it up front blocks
adding a reel the moment a staff member doesn't have (or hasn't yet uploaded) a poster image, even
though the reel would otherwise be fully clickable and playable.

## What Changes

- A reel's poster image becomes optional at every layer: a reel can be created, stored, and
  published with no poster.
- The public home page's reels rail renders a reel with no poster as a plain fallback tile — no
  broken `<img>`, no placeholder image asset — that is exactly as clickable as a poster-bearing
  tile: clicking it activates the same third-party embed playback as any other reel.
- The admin reel form no longer requires a poster to create or save a reel; an invalid *supplied*
  image is still handled through the existing media upload validation exactly as today.
- The admin reel list and the reel curation screen show a neutral placeholder in place of the
  poster thumbnail when a reel has none.
- **BREAKING**: `ReelCreateRequest`, `ReelResponse`, `PublicReelItem`, and
  `ReelsCurationReelSummary` (`packages/contracts`) change `posterMediaId`/`posterUrl` from a
  required string to an optional, nullable string. Any existing caller that assumes `posterUrl` is
  always present must be updated.

## Capabilities

### New Capabilities
(none)

### Modified Capabilities
- `reels-curation`: a reel's poster is no longer required at creation or update; the public rail
  and the admin surfaces render a reel with no poster using a fallback tile instead of an image,
  and that fallback is exactly as playable (clickable, activates the same embed) as a poster-bearing
  reel.

## Impact

- **Database**: `reels.poster_media_id` column becomes nullable (migration required). The
  `ON DELETE RESTRICT` foreign key is unaffected — it only ever fires for a reel that has a poster
  set.
- **Contracts** (`packages/contracts/src/reel.ts`, `reelsCuration.ts`): `posterMediaId` becomes
  `.nullable().optional()` in `reelCreateRequestSchema` (already optional, now also nullable, in
  `reelUpdateRequestSchema`); `posterUrl` becomes `.nullable()` in `reelResponseSchema`,
  `publicReelItemSchema`, and `reelsCurationReelSummarySchema`.
- **API** (`apps/api/src/modules/reels/*`): `reel.repository.ts` and `reelsCuration.repository.ts`
  change their `innerJoin(media, ...)` on the poster to a `leftJoin`, since a reel may reference no
  media row at all; `reel.mapper.ts` and `reelsCuration.mapper.ts` derive `posterUrl` only when a
  storage path is present, otherwise `null`.
- **Admin** (`apps/admin/src/pages/ReelLibraryPage.tsx`): remove the required-poster gate on
  create; relabel the field optional; render a placeholder in the list row when a reel has no
  poster.
- **Public web** (`apps/web/components/home/ReelsRail.tsx`): the tile's `<img>` renders only when
  `posterUrl` is present; the existing `bg-ink` tile background and "PLAY" badge already form a
  complete fallback visual with no new asset needed, and the tile's click handler is unchanged
  either way.
- **Tests**: `packages/contracts/src/reel.test.ts`, `apps/api/src/modules/reels/reel.service.test.ts`,
  `apps/api/src/modules/reels/reelsCuration.service.test.ts` (if present), `publicReels.service.test.ts`,
  `apps/web/components/home/ReelsRail.test.tsx` need cases for a reel with no poster.
