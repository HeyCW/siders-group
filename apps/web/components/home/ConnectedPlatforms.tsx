import Image from 'next/image';
import { SUB_BRANDS } from '../../lib/content';

const GROUPS = ['Media Platform', 'News & Community'] as const;

/** The masthead's logo row, directly under the "brands connected" stats band
 *  (`Siders Broadsheet.dc.html` — the `Media Platform` / `News & Community` columns). Reads from
 *  the hardcoded `SUB_BRANDS` list, not the anak usaha DB profile that `AnakUsahaTiles.tsx` below
 *  renders — this row is meant to stay fixed regardless of what an admin edits there. */
export function ConnectedPlatforms() {
  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-[clamp(24px,4vw,48px)] pt-[clamp(24px,3.5vw,40px)]">
      {GROUPS.map((kind) => {
        const group = SUB_BRANDS.filter((brand) => brand.kind === kind);
        if (group.length === 0) return null;
        return (
          <div key={kind}>
            <div className="font-sans text-[11px] font-bold uppercase tracking-widest text-muted">{kind}</div>
            <div className="flex flex-wrap items-center gap-[clamp(16px,2.5vw,28px)] pt-3.5">
              {group.map((brand) => (
                <span
                  key={brand.name}
                  className={`flex h-[104px] w-[140px] items-center justify-center p-2.5 ${
                    brand.tile === 'transparent' ? '' : 'border border-rule'
                  }`}
                  style={{ background: brand.tile }}
                >
                  {brand.logo ? (
                    <Image
                      src={brand.logo}
                      alt={brand.name}
                      width={120}
                      height={88}
                      className="h-full w-full object-contain"
                    />
                  ) : (
                    <span
                      className="text-center font-serif text-xs font-bold uppercase tracking-wide"
                      style={{ color: brand.tileInk }}
                    >
                      {brand.name}
                    </span>
                  )}
                </span>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
