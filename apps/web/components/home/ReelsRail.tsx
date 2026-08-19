'use client';

import { useState } from 'react';
import type { PublicReelItem } from '@siders/contracts';
import { buildReelEmbedUrl } from '@siders/contracts';
import { SectionHeading } from '../layout/SectionHeading';

/**
 * Poster-bearing reels stay posters-only until activation — `reels-curation/spec.md` binds this
 * component specifically ("this requirement constrains the follow-up change that renders the
 * rail on `/`"). Closing the lightbox unmounts the iframe rather than hiding it.
 *
 * A reel with no poster is the one exception: its tile renders a live provider embed on initial
 * render instead of a flat fallback (specs/reels-curation/spec.md - "A posterless reel's tile is
 * a live, non-interactive embed"). That embed is `pointer-events-none` so a click still lands on
 * the wrapping `<button>` and opens the same lightbox as any other reel — the tile's own embed
 * never plays, it is a cover only.
 */
export function ReelsRail({ reels }: { reels: PublicReelItem[] }) {
  const [active, setActive] = useState<PublicReelItem | null>(null);

  if (reels.length === 0) return null;

  return (
    <div className="pt-[clamp(32px,5vw,64px)]">
      <SectionHeading title="Reels" trailing="This week" />
      {/* `auto-cols-[minmax(150px,1fr)]` used to have no upper bound: with only one or two
          reels, `1fr` stretched each tile to fill the whole row, and the 9:16 aspect ratio
          turned that into an oversized tile regardless of reel count. A fixed 328px keeps tiles
          a consistent size regardless of reel count, and is wide enough that a posterless tile's
          live provider embed (Instagram/TikTok's widgets need roughly 326px+ to render their own
          chrome without an internal scrollbar) fits without scrolling inside itself — the embed
          URL and its branding are unchanged, only the tile's own width grows to fit it. */}
      <div className="no-scrollbar grid snap-x snap-mandatory grid-flow-col auto-cols-[328px] gap-[clamp(12px,2vw,20px)] overflow-x-auto py-[clamp(16px,2.5vw,24px)]">
        {reels.map((reel, i) => (
          <button
            key={`${reel.provider}-${reel.externalId}`}
            type="button"
            onClick={() => setActive(reel)}
            className="block snap-start text-left"
          >
            <div className="relative aspect-[9/16] w-full bg-ink">
              {reel.posterUrl ? (
                <img
                  src={reel.posterUrl}
                  alt={reel.caption ?? `Reel ${i + 1}`}
                  className="absolute inset-0 h-full w-full object-cover"
                />
              ) : (
                <iframe
                  src={buildReelEmbedUrl(reel.provider, reel.externalId)}
                  title={reel.caption ?? `Reel ${i + 1}`}
                  tabIndex={-1}
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 h-full w-full"
                />
              )}
              <span className="absolute bottom-2.5 left-2.5 bg-signal px-2.5 py-1.5 font-sans text-[11px] font-bold tracking-widest text-ink">
                PLAY
              </span>
            </div>
            {reel.caption && <div className="mt-2 text-[13px] leading-[1.5]">{reel.caption}</div>}
          </button>
        ))}
      </div>

      {active && (
        <div
          className="fixed inset-0 z-[80] flex animate-inkfade items-center justify-center bg-ink/[.92] p-6"
          onClick={() => setActive(null)}
        >
          <div
            className="relative aspect-[9/16] h-[min(86vh,760px)] border border-muted bg-ink"
            onClick={(e) => e.stopPropagation()}
          >
            <iframe
              src={buildReelEmbedUrl(active.provider, active.externalId)}
              title={active.caption ?? 'Siders reel'}
              allow="autoplay; encrypted-media"
              className="h-full w-full"
            />
          </div>
          <button
            type="button"
            onClick={() => setActive(null)}
            className="absolute right-5 top-5 border border-paper px-3 py-2 font-sans text-[11px] font-bold uppercase tracking-widest text-paper transition-colors duration-hover ease-hover hover:bg-paper hover:text-ink focus-visible:bg-paper focus-visible:text-ink"
          >
            Close ×
          </button>
        </div>
      )}
    </div>
  );
}
