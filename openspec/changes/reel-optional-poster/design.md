## Context

`reels.poster_media_id` is `NOT NULL` with `ON DELETE RESTRICT` (`packages/db/src/schema/reels.ts`),
required in `reelCreateRequestSchema` and serialized as a plain required string in
`reelResponseSchema`/`publicReelItemSchema`/`reelsCurationReelSummarySchema`
(`packages/contracts/src/reel.ts`, `reelsCuration.ts`). Every read in
`apps/api/src/modules/reels/reel.repository.ts` and `reelsCuration.repository.ts` uses an
`innerJoin(media, eq(media.id, reels.posterMediaId))` to derive the poster URL at map time. The
public renderer, `ReelsRail` in `apps/web/components/home/ReelsRail.tsx`, unconditionally renders
`<img src={reel.posterUrl}>` as the tile's only pre-activation visual; clicking the tile mounts a
third-party embed `<iframe>` built from `(provider, externalId)` — nothing about that click handler
reads the poster. See proposal.md - Why.

This mirrors the just-shipped `partner-optional-website` change's contract shape
(`websiteUrl.nullable().optional()`), but is a more drastic change in one respect: a partner's
website is a secondary, optional-feeling field, while a reel's poster is currently the *entire*
pre-activation visual with no other fallback. Making it optional therefore requires designing that
fallback, which the partner change never needed.

## Goals / Non-Goals

**Goals:**
- Allow a reel to exist with no poster, end to end (DB → API → admin → public rail).
- A poster-less reel is exactly as clickable/playable as a poster-bearing one — the fallback tile
  carries the same activation behavior, per `specs/reels-curation/spec.md` ("A reel with no poster
  is still fully playable").
- Preserve every existing behavior for a reel that does have a poster.

**Non-Goals:**
- No change to the third-party embed mechanism itself, provider allowlist, or URL parsing.
- No change to reel status/visibility rules or the curation ordering mechanics.
- No new placeholder image asset — the fallback is built from existing layout/color tokens already
  in `ReelsRail.tsx` (see Decisions below), not a new illustration.

## Decisions

**DB column: nullable, FK unchanged.** Drop `.notNull()` from `posterMediaId` in
`packages/db/src/schema/reels.ts`; the `ON DELETE RESTRICT` foreign key stays exactly as declared —
a nullable FK column simply has no constraint to check when its value is `NULL`, and continues to
restrict deletion of a media row that some *other* reel still references. No backfill needed;
existing rows already carry real poster references.

**Contracts: same `.nullable().optional()` shape as `partner.ts`'s `websiteUrl`.**
`reelCreateRequestSchema.posterMediaId` becomes `z.string().uuid().nullable().optional()` (it
already existed only as required before); `reelUpdateRequestSchema.posterMediaId` gains
`.nullable()` on top of its existing `.optional()` so an edit can explicitly clear a stored poster,
not just leave it alone. `reelResponseSchema.posterUrl`, `publicReelItemSchema.posterUrl`, and
`reelsCurationReelSummarySchema.posterUrl` (`packages/contracts/src/reelsCuration.ts`) become
`z.string().nullable()`. Absent means "don't touch" on update; `null` means "no poster" on create
or "clear it" on update; a string sets it — identical convention to `articleWriteFieldsSchema`'s
`featuredMediaId` and the shipped `partner.ts` change.

**API: `innerJoin` → `leftJoin` on the poster, everywhere it's joined.** Both
`reel.repository.ts`'s `findByIdJoined`/`list()` and `reelsCuration.repository.ts`'s
`selectJoined()` currently `innerJoin(media, eq(media.id, reels.posterMediaId))` — an `innerJoin`
silently drops any row whose `posterMediaId` is `NULL`, which would make a poster-less reel
invisible everywhere (a correctness bug, not just a missing feature) once the column allows `NULL`.
Both become `leftJoin`. `posterStoragePath` on `ReelRow`/`ReelsCurationEntryRow` becomes
`string | null`; `reel.mapper.ts`'s `toReelResponse` and `reelsCuration.mapper.ts`'s
`toPublicReelItem`/`toReelsCurationEntryResponse` derive `posterUrl: row.posterStoragePath ? publicUrlFor(env, row.posterStoragePath) : null` instead of calling `publicUrlFor` unconditionally.

**Public rendering: omit the `<img>`, keep the existing tile chrome as the fallback.**
`ReelsRail`'s tile is `<div className="relative aspect-[9/16] w-full bg-ink">` containing the
`<img>` and an absolutely-positioned "PLAY" badge `<span>`. When `reel.posterUrl` is `null`, the
`<img>` is simply not rendered — the `bg-ink` background and the "PLAY" badge alone already form a
complete, intentional-looking tile with no missing-image icon and no new asset to design or ship.
The `onClick={() => setActive(reel)}` handler is on the outer `<button>`, unconditionally, so a
poster-less tile is identically clickable. This is the simplest option that satisfies "still fully
playable" without inventing new visual language; an alternative (a generic icon/illustration
placeholder) was considered and rejected as unnecessary design surface for what is already a
solid-color facade.

**Admin: remove the requiredness gate, keep the upload mechanics.**
`ReelLibraryPage.tsx`'s `canCreate` drops the `posterMediaId !== null` clause (kept:
`parsed !== null` from URL parsing); `handleCreate`'s early return no longer requires
`posterMediaId`; the field relabels to "Poster image (optional)". The list row's
`<img src={reel.posterUrl}>` gains the same conditional-fallback treatment as `ReelsRail` (a plain
placeholder box in place of the thumbnail) so a poster-less reel doesn't render a broken image in
the admin list either.

**Controller normalizes `undefined` → `null` before hitting Drizzle**, matching the fix already
needed in `partner.repository.ts`'s `create` under `exactOptionalPropertyTypes`: `reel.controller.ts`'s
`create` handler passes `posterMediaId: body.posterMediaId ?? null` into `service.create(...)`
alongside its existing `caption: body.caption ?? null` normalization, so `CreateReelServiceInput`
and the repository's insert never see a bare `undefined`.

## Risks / Trade-offs

- **Breaking contract change** (called out in proposal.md as BREAKING): any consumer of
  `ReelResponse`/`PublicReelItem`/`ReelsCurationReelSummary` that assumes `posterUrl: string` needs
  a type-level update. Mitigation: this repo is the only consumer (`apps/web`, `apps/admin`); grep
  for `.posterUrl` as part of implementation to catch every call site in the same change.
- **`innerJoin` → `leftJoin` is a correctness fix, not just an enabler**: if this is missed in
  either repository, a poster-less reel would silently vanish from `list()`/curation reads instead
  of erroring — worth double-checking with a "no poster" fixture in both repositories' tests.
- **Existing tests assert a poster is always present** (contract tests, `ReelsRail.test.tsx`,
  `ReelLibraryPage.tsx` has no test file today — a gap already present before this change, not
  introduced by it). These need updating alongside the schema change.

## Migration Plan

1. Add a DB migration dropping `NOT NULL` on `reels.poster_media_id` (nullable is a strict
   widening of the existing column; no data migration required).
2. Update `packages/contracts` schemas.
3. Update both repositories' joins, both mappers, the service/controller normalization, the admin
   page, and `ReelsRail.tsx` in the same change.
4. Rollback: reverting the migration (re-adding `NOT NULL`) is safe as long as no reel has been
   saved without a poster in the interim.
