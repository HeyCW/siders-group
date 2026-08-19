## 1. Rail tile

- [x] 1.1 In `apps/web/components/home/ReelsRail.tsx`, when `reel.posterUrl` is falsy, render
      `<iframe src={buildReelEmbedUrl(reel.provider, reel.externalId)} className="pointer-events-none absolute inset-0 h-full w-full" tabIndex={-1} aria-hidden="true" />`
      inside the tile in place of the current bare `bg-ink` fallback; keep the "PLAY" badge
      overlaid on top
- [x] 1.2 Confirm the wrapping `<button onClick={() => setActive(reel)}>` still receives the
      click (verify `pointer-events-none` on the iframe lets it fall through) and that activating
      a posterless reel opens the identical lightbox a poster-bearing reel does
- [x] 1.3 Poster-bearing reels: confirm no change — still render the `<img>`, still create no
      embed until `active` is set

## 2. Tests

- [x] 2.1 Updated `apps/web/components/home/ReelsRail.test.tsx`: a posterless-reel fixture renders
      an `<iframe>` with the correct `buildReelEmbedUrl` src on initial render (no interaction);
      a poster-bearing reel still renders no `<iframe>` until clicked; clicking a posterless
      reel's tile opens the lightbox with the same embed URL as its tile preview — 8 tests pass

## 3. Verification

- [x] 3.1 `apps/web` full test suite passes (110/110)
- [ ] 3.2 Manual check: a reel of each provider (YouTube, TikTok, Instagram) with no poster shows
      a live embed preview in its tile, and clicking it opens and plays the lightbox — **not
      run**: needs the dev server up and real reel records to click through in a browser
