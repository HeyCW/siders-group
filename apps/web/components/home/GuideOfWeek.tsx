import type { PublicGuidePick } from '@siders/contracts';
import { SectionHeading } from '../layout/SectionHeading';
import { Reveal } from '../ui/Reveal';
import { EDITION } from '../../lib/content';

/**
 * The guide-of-the-week section: an admin-managed, dynamically-sized grid of city picks
 * (specs/guide-of-the-week-management/spec.md), replacing the previous hardcoded
 * `GUIDE_OF_THE_WEEK` placeholder (no real photos, exactly two entries). `EDITION` stays imported
 * here — it is a site-wide label shared with `SiteFooter`'s colophon, not a guide-pick field
 * (design.md - decision 3), so it is not part of the `guides` prop.
 *
 * Every cell renders as its own fully bordered card, arranged on
 * `grid-cols-[repeat(auto-fit,minmax(280px,1fr))]` with a shared border — this holds identically
 * for one pick, two, or a count that wraps onto further rows, with no per-index conditional
 * (design.md - "Dynamic-count layout: uniform bordered cards, not positional dividers"). The
 * previous markup special-cased exactly two cells (a right-border/right-padding first column vs.
 * a left-padding-only remainder), which had no defined behavior once a third pick or a wrapped
 * row existed.
 */
export function GuideOfWeek({ guides }: { guides: PublicGuidePick[] }) {
  if (guides.length === 0) return null;

  return (
    <div className="pt-[clamp(32px,5vw,64px)]">
      <SectionHeading title="Siders Guide of the Week" trailing={EDITION} />
      <Reveal
        delayMs={90}
        className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-px border-l border-t border-rule bg-rule"
      >
        {guides.map((guide, index) => (
          <div
            key={`${guide.city}-${guide.place}-${index}`}
            className="border-b border-r border-rule bg-paper p-[clamp(14px,2vw,28px)]"
          >
            <div className="font-sans text-[11px] font-bold uppercase tracking-widest text-muted">{guide.city}</div>
            <div className="my-2 font-serif text-[clamp(22px,2.6vw,30px)] font-bold leading-[1.1] tracking-[-0.02em]">
              {guide.place}
            </div>
            <img
              src={guide.photoUrl}
              alt={guide.place}
              className="aspect-[4/3] w-full border border-rule object-cover"
            />
            <p className="mt-3 text-[13px] leading-[1.65]">{guide.description}</p>
          </div>
        ))}
      </Reveal>
    </div>
  );
}
