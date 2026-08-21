import type { PresentedAnakUsaha } from '../../lib/anakUsaha';

const GROUPS: PresentedAnakUsaha['kind'][] = ['Media Platform', 'News & Community'];

/** The masthead's logo row, directly under the "brands connected" stats band
 *  (`Siders Broadsheet.dc.html` — the `Media Platform` / `News & Community` columns), grouped by
 *  `kind` — a fixed enum validated server-side (`anakUsahaKindSchema`), not a free-text field, so
 *  a typo can never silently drop a brand from this grouping the way the old hardcoded
 *  `SubBrand.kind` string could. Colors are gone, same as `AnakUsahaTiles` — one neutral tile
 *  background, the logo carries the identity. */
export function ConnectedPlatforms({ brands }: { brands: PresentedAnakUsaha[] }) {
  if (brands.length === 0) return null;

  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-[clamp(24px,4vw,48px)] pt-[clamp(24px,3.5vw,40px)]">
      {GROUPS.map((kind) => {
        const group = brands.filter((brand) => brand.kind === kind);
        if (group.length === 0) return null;
        return (
          <div key={kind}>
            <div className="font-sans text-[11px] font-bold uppercase tracking-widest text-muted">{kind}</div>
            <div className="flex flex-wrap items-center gap-[clamp(16px,2.5vw,28px)] pt-3.5">
              {group.map((brand) => (
                <span
                  key={brand.id}
                  className="flex h-[104px] w-[140px] items-center justify-center border border-rule bg-paper p-2.5"
                >
                  {brand.logoUrl ? (
                    <img
                      src={brand.logoUrl}
                      alt={brand.name}
                      width={120}
                      height={88}
                      className="h-full w-full object-contain"
                    />
                  ) : (
                    <span className="font-serif text-xs font-bold uppercase tracking-wide text-muted">
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
