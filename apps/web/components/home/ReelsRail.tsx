'use client';

import { useState } from 'react';
import type { PublicReelItem } from '@siders/contracts';
import { buildReelEmbedUrl } from '@siders/contracts';
import { SectionHeading } from '../layout/SectionHeading';

/**
 * Posters only until activation — `reels-curation/spec.md` binds this component specifically
 * ("this requirement constrains the follow-up change that renders the rail on `/`"). Closing
 * the lightbox unmounts the iframe rather than hiding it.
 */
export function ReelsRail({ reels }: { reels: PublicReelItem[] }) {
  const [active, setActive] = useState<PublicReelItem | null>(null);

  if (reels.length === 0) return null;

  return (
    <div className="pt-[clamp(32px,5vw,64px)]">
      <SectionHeading title="Reels" trailing="This week" />
      <div className="no-scrollbar grid snap-x snap-mandatory grid-flow-col auto-cols-[minmax(150px,1fr)] gap-[clamp(12px,2vw,20px)] overflow-x-auto py-[clamp(16px,2.5vw,24px)]">
        {reels.map((reel, i) => (
          <button
            key={`${reel.provider}-${reel.externalId}`}
            type="button"
            onClick={() => setActive(reel)}
            className="block snap-start text-left"
          >
            <div className="relative aspect-[9/16] w-full bg-ink">
              <img
                src={reel.posterUrl}
                alt={reel.caption ?? `Reel ${i + 1}`}
                className="absolute inset-0 h-full w-full object-cover"
              />
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
            className="absolute right-5 top-5 border border-paper px-3 py-2 font-sans text-[11px] font-bold uppercase tracking-widest text-paper hover:bg-signal hover:text-ink"
          >
            Close ×
          </button>
        </div>
      )}
    </div>
  );
}
