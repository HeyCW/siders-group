## Rejected: server-side thumbnail auto-fetch

The first design considered fetching each provider's official thumbnail (YouTube's public
`img.youtube.com` URL, TikTok's oEmbed-returned `thumbnail_url`) server-side at reel-creation
time and storing it as an ordinary media record. It was dropped in favor of this simpler
client-side approach after weighing:

- It would have been this API's first outbound request to a host it doesn't fully control the
  target of (TikTok's oEmbed JSON response), needing timeout/size/scheme bounds and content
  re-sniffing to be safe — real, if bounded, complexity for a purely cosmetic fallback.
- Instagram has no equivalent public thumbnail source, so the result would still be inconsistent
  across providers.
- The embed the lightbox already builds from `(provider, externalId)` is available for free,
  client-side, with no new code path and no third-party API integration.

## Play is triggered exactly the same way for every reel

The tile's embed is `pointer-events: none` specifically so a click anywhere on the tile still
reaches the wrapping `<button onClick={() => setActive(reel)}>` unchanged — the same handler a
poster-bearing tile's click already goes through. This was the deciding factor over letting each
provider's own embed handle its own inline play button directly: YouTube's iframe API exposes a
reliable postMessage-based play control, but TikTok's and Instagram's public embeds do not, so
building "click the tile's iframe itself to play" would only work consistently for YouTube. Routing
every reel's actual playback through the existing lightbox, regardless of poster or provider,
keeps the "click it, it plays" behavior uniform without needing any provider-specific control
code.

## Narrowing "third-party embeds load only on user activation" instead of dropping it

The requirement's original intent — avoid loading a third-party frame/script for a reel purely
because it appears in a list, sight unseen — still holds for every poster-bearing reel, which is
the common case (a staff member is expected to add a poster in the ordinary course of curating the
rail). The carve-out for posterless reels is scoped as narrowly as possible: it's not a general
license to embed early, it's specifically the fallback for the one case where there is currently
no cheaper way to represent the video visually.
