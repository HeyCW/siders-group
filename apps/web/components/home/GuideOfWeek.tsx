'use client';

import { useRef } from 'react';
import type { PublicGuidePick } from '@siders/contracts';
import { SectionHeading } from '../layout/SectionHeading';
import { Reveal } from '../ui/Reveal';
import { groupGuidePicksByCity } from '../../lib/guidePicks';

/**
 * The guideline-of-the-week section: an admin-managed, dynamically-sized grid of self-hosted
 * videos grouped by city (specs/guide-of-the-week-management/spec.md;
 * openspec/changes/self-hosted-guideline-videos). Grouping happens client-side over the flat
 * ordered list the public endpoint returns — see `lib/guidePicks.ts` -
 * `groupGuidePicksByCity`.
 *
 * Every cell renders as its own fully bordered card, three to a row on desktop (fewer as the
 * viewport narrows) with a shared border — this holds identically for one pick, two, or a count
 * that wraps onto further rows, with no per-index conditional
 * (design.md - "Dynamic-count layout: uniform bordered cards, not positional dividers"). Tiles
 * are sized like a reel — a portrait 9:16 video — rather than the wide 4:3 card this section used
 * before self-hosted video replaced photos.
 *
 * Each video renders poster-first (`preload="none"`, native `poster`) and only begins loading or
 * playing on user activation — the native `<video>` element does this without any of the
 * lightbox/iframe machinery a third-party embed needed
 * (specs/web-public-site/spec.md - "Guideline videos render poster-first with playback on
 * activation"). Activating one video pauses every other one via the shared `videoRefs` list,
 * satisfying "activating one pick SHALL NOT begin playback for any other pick".
 */
export function GuideOfWeek({ guides }: { guides: PublicGuidePick[] }) {
  const videoRefs = useRef<Map<string, HTMLVideoElement>>(new Map());

  if (guides.length === 0) return null;

  const groups = groupGuidePicksByCity(guides);

  function handlePlay(current: HTMLVideoElement) {
    for (const video of videoRefs.current.values()) {
      if (video !== current && !video.paused) video.pause();
    }
  }

  return (
    <div className="pt-[clamp(32px,5vw,64px)]">
      <SectionHeading title="Siders Guideline of the Week" />
      {groups.map((group) => (
        <div key={group.city} className="pt-[clamp(20px,3vw,28px)] first:pt-0">
          <div className="pb-2 font-sans text-[11px] font-bold uppercase tracking-widest text-muted">
            {group.city}
          </div>
          <Reveal
            delayMs={90}
            className="grid grid-cols-2 sm:grid-cols-3 border-l border-t border-rule"
          >
            {group.picks.map((guide, index) => {
              const key = `${guide.city}-${guide.place}-${index}`;
              return (
                <div key={key} className="border-b border-r border-rule p-[clamp(10px,1.5vw,16px)]">
                  <video
                    ref={(el) => {
                      if (el) videoRefs.current.set(key, el);
                      else videoRefs.current.delete(key);
                    }}
                    src={guide.videoUrl}
                    poster={guide.photoUrl}
                    preload="none"
                    controls
                    className="aspect-[9/16] w-full border border-rule object-cover"
                    onPlay={(e) => handlePlay(e.currentTarget)}
                  >
                    <track kind="captions" />
                  </video>
                  <div className="mt-2 font-serif text-[clamp(14px,1.6vw,17px)] font-bold leading-[1.15] tracking-[-0.01em]">
                    {guide.place}
                  </div>
                  <p className="mt-1 text-[12px] leading-[1.5]">{guide.description}</p>
                </div>
              );
            })}
          </Reveal>
        </div>
      ))}
    </div>
  );
}
