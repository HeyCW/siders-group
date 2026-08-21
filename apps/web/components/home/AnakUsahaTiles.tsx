import type { PresentedAnakUsaha } from '../../lib/anakUsaha';
import { Reveal } from '../ui/Reveal';
import { RuleDraw } from '../ui/RuleDraw';

/** Each tile's own links go straight to that sub-brand's real social profiles — there is still
 *  no per-sub-brand page on this site (`proposal.md` — Non-Goals). Colors are gone: every tile
 *  shares one neutral background and the uploaded logo carries the identity instead
 *  (design.md - "Colors are being removed entirely"). The logo is a remote URL from the media
 *  module, rendered via a plain `<img>` rather than `next/image` — no `images.remotePatterns` is
 *  configured, matching the existing precedent in `PartnerGrid.tsx`. */
export function AnakUsahaTiles({ brands }: { brands: PresentedAnakUsaha[] }) {
  if (brands.length === 0) return null;

  return (
    <div className="pt-[clamp(20px,3vw,40px)]">
      <Reveal className="pb-2">
        <h2 className="font-serif text-xl font-black uppercase tracking-wide">Anak Usaha</h2>
      </Reveal>
      <RuleDraw className="border-b border-ink" />
      <div className="grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))]">
        {brands.map((brand) => (
          <Reveal
            key={brand.id}
            delayMs={90}
            className="border-b border-rule border-r border-r-rule-strong py-[clamp(18px,2.5vw,26px)] pr-[clamp(16px,2vw,28px)]"
          >
            <span className="flex h-[clamp(96px,11vw,140px)] items-center justify-center border border-rule bg-paper p-2">
              {brand.logoUrl ? (
                <img
                  src={brand.logoUrl}
                  alt={brand.name}
                  width={140}
                  height={140}
                  className="h-full w-full object-contain"
                />
              ) : (
                <span className="font-serif text-sm font-bold uppercase tracking-wide text-muted">{brand.name}</span>
              )}
            </span>
            <div className="mt-1.5 font-serif text-[clamp(19px,2.2vw,24px)] font-bold leading-[1.15] tracking-[-0.02em]">
              {brand.name}
            </div>
            {brand.description && (
              <p className="mt-2 text-[13px] leading-[1.65] text-muted">{brand.description}</p>
            )}
            {brand.links.length > 0 && (
              <div className="flex flex-wrap gap-2.5 pt-3.5">
                {brand.links.map((link) => (
                  <a
                    key={link.href}
                    href={link.href}
                    target="_blank"
                    rel="noopener"
                    className="border-b-2 border-ink pb-0.5 font-sans text-[11px] font-bold uppercase tracking-widest transition-colors duration-hover ease-hover hover:bg-signal"
                  >
                    {link.label} ↗
                  </a>
                ))}
              </div>
            )}
          </Reveal>
        ))}
      </div>
    </div>
  );
}
