## Why

`reel-optional-poster` made a reel's poster optional, but a reel with no poster shows a bare flat
`bg-ink` tile with a "PLAY" badge on the public rail — noticeably plainer than a poster-bearing
tile, with no visual hint of what the video actually is. Auto-generating a thumbnail was
considered (fetching a frame or a provider-hosted thumbnail server-side) and rejected: reels are
never stored as playable video files by this system, so there is no frame to grab, and adding a
staff-only server-side fetch to a third party for a purely cosmetic fallback is disproportionate
complexity. The simpler fix is to let the provider's own embed serve as its own cover.

## What Changes

- A reel with no poster now renders a live, non-interactive embed of the provider's video as its
  rail tile (instead of the flat `bg-ink` fallback), using the same `buildReelEmbedUrl` composition
  the click-to-play lightbox already uses. The embed is not autoplaying — it shows whatever
  default, paused state the provider's own embed renders before playback.
- The tile's embed cannot be interacted with directly (`pointer-events: none`) — the entire tile
  remains a single click target that opens the same lightbox player as every other reel,
  unchanged. Play is triggered identically for every provider and for every reel, poster or not.
- A reel that does have a poster is completely unaffected: it keeps showing the poster image, and
  keeps deferring its embed until the lightbox opens.
- **BREAKING** (spec): narrows `reels-curation`'s "Third-party embeds load only on user
  activation" requirement. A posterless reel's tile now creates a third-party frame and a
  provider network request on initial render, not on activation. A poster-bearing reel is
  unaffected and keeps today's behavior exactly.

## Impact

- **Affected specs**: `reels-curation` (MODIFIED — narrows the activation-gating requirement to
  exclude posterless reels' tile preview)
- **Affected code**: `apps/web/components/home/ReelsRail.tsx` only — no backend, contract, or
  database change. The tile already has `reel.provider`/`reel.externalId` and already imports
  `buildReelEmbedUrl` for the lightbox.
- **Privacy/performance note**: a homepage view with N posterless reels visible in the rail now
  makes up to N unsolicited requests to third-party providers (Instagram/TikTok/YouTube) before
  any user interaction, where previously it made none until a reel was clicked. This is an
  explicit, accepted tradeoff to avoid the complexity of a server-side thumbnail fetch — see
  `design.md`.
- **Migration**: none.
