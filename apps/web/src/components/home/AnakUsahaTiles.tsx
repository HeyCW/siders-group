import type { PresentedAnakUsaha } from '../../lib/anakUsaha';
import { Reveal } from '../ui/Reveal';
import { RuleDraw } from '../ui/RuleDraw';

/** Each tile's own links go straight to that sub-brand's real social profiles — there is still
 *  no per-sub-brand page on this site (`proposal.md` — Non-Goals). Colors are gone: every tile
 *  shares one neutral background and the uploaded logo carries the identity instead
 *  (design.md - "Colors are being removed entirely"). The logo is a remote URL from the media
 *  module, rendered via a plain `<img>`, matching the existing precedent in `PartnerGrid.tsx`. */
export function AnakUsahaTiles({ brands }: { brands: PresentedAnakUsaha[] }) {
  if (brands.length === 0) return null;

  return (
    <div className="pt-[clamp(20px,3vw,40px)]">
      <RuleDraw className="border-b border-ink" />
      <div className="flex flex-col">
        {brands.map((brand) => (
          <Reveal
            key={brand.id}
            delayMs={90}
            className="flex items-start gap-x-[clamp(14px,2vw,24px)] border-b border-rule py-[clamp(14px,2vw,20px)]"
          >
            <span
              className={`flex h-[clamp(56px,6vw,72px)] w-[clamp(56px,6vw,72px)] shrink-0 items-center justify-center border border-rule p-1.5 ${brand.backgroundColor ? '' : 'bg-paper'}`}
              style={brand.backgroundColor ? { backgroundColor: brand.backgroundColor } : undefined}
            >
              {brand.logoUrl ? (
                <img
                  src={brand.logoUrl}
                  alt={brand.name}
                  width={72}
                  height={72}
                  className="h-full w-full object-contain"
                />
              ) : (
                <span className="font-serif text-[11px] font-bold uppercase tracking-wide text-muted">
                  {brand.name}
                </span>
              )}
            </span>
            <div className="min-w-0 flex-1">
              <div className="font-serif text-[clamp(17px,1.8vw,20px)] font-bold leading-[1.15] tracking-[-0.02em]">
                {brand.name}
              </div>
              {brand.description && (
                <p className="mt-1.5 text-[15px] leading-[1.5] text-muted">{brand.description}</p>
              )}
              {brand.links.length > 0 && (
                <div className="flex flex-wrap gap-2.5 pt-2.5">
                  {brand.links.map((link) => (
                    <a
                      key={link.href}
                      href={link.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="border-b-2 border-ink pb-0.5 font-sans text-[11px] font-bold uppercase tracking-widest transition-colors duration-hover ease-hover hover:bg-signal"
                    >
                      {link.label} ↗︎
                    </a>
                  ))}
                </div>
              )}
            </div>
          </Reveal>
        ))}
      </div>
    </div>
  );
}
