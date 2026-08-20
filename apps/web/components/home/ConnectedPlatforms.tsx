import Image from 'next/image';
import { SUB_BRANDS } from '../../lib/content';

const GROUPS = ['Media Platform', 'News & Community'] as const;

/** The masthead's logo row, directly under the "brands connected" stats band
 *  (`Siders Broadsheet.dc.html` — the `Media Platform` / `News & Community` columns), grouped
 *  from the same `SUB_BRANDS` data as the Anak Usaha cards below rather than a second copy. */
export function ConnectedPlatforms() {
  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-[clamp(24px,4vw,48px)] pt-[clamp(24px,3.5vw,40px)]">
      {GROUPS.map((kind) => (
        <div key={kind}>
          <div className="font-sans text-[11px] font-bold uppercase tracking-widest text-muted">
            {kind}
          </div>
          <div className="flex flex-wrap items-center gap-[clamp(16px,2.5vw,28px)] pt-3.5">
            {SUB_BRANDS.filter((brand) => brand.kind === kind).map((brand) => (
              <span
                key={brand.name}
                className="flex h-[104px] w-[140px] items-center justify-center border border-rule p-2.5"
                style={{ background: brand.tile }}
              >
                <Image
                  src={brand.logo}
                  alt={brand.name}
                  width={120}
                  height={88}
                  className="h-full w-full object-contain"
                />
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
