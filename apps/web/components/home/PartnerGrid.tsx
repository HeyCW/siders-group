import type { PublicPartner } from '@siders/contracts';
import { Reveal } from '../ui/Reveal';
import { RuleDraw } from '../ui/RuleDraw';

/**
 * Enough tiles in one animated half of the track that it exceeds the widest realistic viewport
 * even with a single partner — not a hardcoded ×2 duplication
 * (specs/web-public-site/spec.md - "Few partners still scroll continuously"). At a ~160px tile,
 * 24 tiles is ~3840px, comfortably past a 4K-wide browser window.
 */
const MIN_TILES_PER_HALF = 24;

function repeatToFill(partners: PublicPartner[]): PublicPartner[] {
  const repeatFactor = Math.max(1, Math.ceil(MIN_TILES_PER_HALF / partners.length));
  return Array.from({ length: repeatFactor }, () => partners).flat();
}

function PartnerTile({ partner, hidden }: { partner: PublicPartner; hidden: boolean }) {
  return (
    <a
      href={partner.websiteUrl}
      target="_blank"
      rel="noopener noreferrer"
      aria-hidden={hidden || undefined}
      tabIndex={hidden ? -1 : undefined}
      className="flex h-16 w-40 shrink-0 items-center justify-center px-4"
    >
      <img src={partner.logoUrl} alt={partner.name} className="max-h-full max-w-full object-contain" />
    </a>
  );
}

/**
 * The partner section: an admin-managed logo ticker (specs/partner-management/spec.md), replacing
 * the previous hardcoded `PARTNERS` placeholder grid. Pure CSS marquee — a track built from one
 * "half" (the real partner list, repeated only as far as `repeatToFill` requires to cover the
 * widest viewport) rendered twice back to back, animated `translateX(0 -> -50%)` under
 * `motion-safe:` so the two halves loop seamlessly (design.md - "Ticker is pure CSS, not
 * JS-driven"). Only the first occurrence of each partner (`index < partners.length`, i.e. the
 * very start of the whole track) is reachable by keyboard or screen reader; every later
 * occurrence — both the min-width padding repeats and the second half's clone — is
 * `aria-hidden` with `tabIndex={-1}` (specs/web-public-site/spec.md - "Each partner is reachable
 * exactly once by keyboard and screen reader"). The `motion-reduce` fallback is the original
 * static wrapping grid, rendered from the same unrepeated partner list.
 */
export function PartnerGrid({ partners }: { partners: PublicPartner[] }) {
  if (partners.length === 0) return null;

  const half = repeatToFill(partners);
  const track = [...half, ...half];

  return (
    <div className="pt-[clamp(32px,5vw,64px)]">
      <Reveal className="pb-2">
        <h2 className="font-serif text-xl font-black uppercase tracking-wide">
          Thank You For Always Trusting Us
        </h2>
      </Reveal>
      <RuleDraw className="border-b border-ink" />

      <Reveal delayMs={90}>
        <div data-testid="partner-static-grid" className="hidden overflow-hidden motion-reduce:block">
          <div className="grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] border-l border-t border-rule">
            {partners.map((partner, index) => (
              <div key={`${partner.name}-${index}`} className="flex h-24 items-center justify-center border-b border-r border-rule px-4">
                <img src={partner.logoUrl} alt={partner.name} className="max-h-full max-w-full object-contain" />
              </div>
            ))}
          </div>
        </div>

        <div data-testid="partner-ticker" className="motion-reduce:hidden overflow-hidden">
          <div
            className="flex w-max motion-safe:animate-marquee hover:[animation-play-state:paused] focus-within:[animation-play-state:paused]"
          >
            {track.map((partner, index) => (
              <PartnerTile key={`${partner.name}-${index}`} partner={partner} hidden={index >= partners.length} />
            ))}
          </div>
        </div>
      </Reveal>
    </div>
  );
}
