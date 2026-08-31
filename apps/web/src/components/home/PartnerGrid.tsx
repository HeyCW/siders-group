import type { PublicPartner } from '@siders/contracts';
import { Reveal } from '../ui/Reveal';
import { RuleDraw } from '../ui/RuleDraw';

/**
 * Enough tiles in one animated half of the track that it exceeds a common wide browser window
 * even with a single partner — not a hardcoded ×2 duplication (specs/web-public-site/spec.md -
 * "Few partners still scroll continuously"). At a ~224px tile, 16 tiles is ~3584px, past a
 * standard widescreen monitor's full-width browser. Traded deliberately for fewer visible repeats
 * of the same few logos when the partner list is short — a very wide (4K+) browser just loops a
 * little sooner, never sits static or shows a partial row.
 */
const MIN_TILES_PER_HALF = 16;

/** Seconds one tile takes to cross the row — fixed per-tile pacing, not a fixed loop duration, so
 *  a short partner list doesn't cycle its few logos past any faster than a long one does
 *  (`specs/web-public-site/spec.md` - "Few partners still scroll continuously" says nothing about
 *  a specific rate, only that it must not sit static). */
const SECONDS_PER_TILE = 3;

function repeatToFill(partners: PublicPartner[]): PublicPartner[] {
  const repeatFactor = Math.max(1, Math.ceil(MIN_TILES_PER_HALF / partners.length));
  return Array.from({ length: repeatFactor }, () => partners).flat();
}

/**
 * One partner, as a link when it has a website URL. Both presentations render through this so the
 * reduced-motion branch carries the same click-through the ticker does — the two differ only in
 * layout, never in what a reader can reach. `hidden` marks a looped duplicate: visual repetition
 * without assistive-tech or keyboard repetition. A partner with no website URL renders as a plain,
 * non-interactive tile instead of a link — no `href`, no navigation, and (since it is not a link at
 * all) no place in the keyboard/screen-reader reachable set
 * (specs/web-public-site/spec.md - "A partner with no website URL renders without a link").
 */
function PartnerTile({
  partner,
  hidden = false,
  className,
}: {
  partner: PublicPartner;
  hidden?: boolean;
  className: string;
}) {
  const logo = <img src={partner.logoUrl} alt={partner.name} className="h-full w-full object-contain" />;

  if (!partner.websiteUrl) {
    return (
      <span aria-hidden={hidden || undefined} className={className}>
        {logo}
      </span>
    );
  }

  return (
    <a
      href={partner.websiteUrl}
      target="_blank"
      rel="noopener noreferrer"
      aria-hidden={hidden || undefined}
      tabIndex={hidden ? -1 : undefined}
      className={className}
    >
      {logo}
    </a>
  );
}

const TICKER_TILE = 'flex h-28 w-56 shrink-0 items-center justify-center px-3 py-2';
const STATIC_TILE = 'flex h-36 items-center justify-center border-b border-r border-rule px-3 py-2';

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
 * static wrapping grid, rendered from the same unrepeated partner list — and, like the ticker,
 * from `PartnerTile`, so link-through is not something a reduced-motion reader silently loses.
 * Only one branch is ever displayed, so neither duplicates the other for assistive tech.
 *
 * The scroll never pauses for a pointer hover — it keeps moving continuously regardless of the
 * mouse (specs/web-public-site/spec.md - "The ticker pauses only for keyboard interaction").
 * Keyboard focus is the one thing that stops it, and it *clears* the animation rather than pausing
 * it, and the difference is load-bearing. The tabbable copies are the first `partners.length`
 * tiles, at the very start of the track; pausing mid-cycle would freeze a focused link exactly where
 * the transform had already carried it — measured at 0 of 160px visible inside the `overflow-hidden`
 * clip. Nothing recovers it, because a transform does not move scroll position, so the browser's
 * scroll-into-view has nothing to scroll (`scrollLeft` stays 0). Dropping the animation snaps the
 * track back to `translateX(0)`, which is precisely where the reachable tiles live, so a tabbed-to
 * link is on screen. Resuming on blur restarts from 0, the position it is already in.
 *
 * Scoped to `:focus-visible`, not plain `:focus-within` — a mouse click on a partner link also
 * focuses it, and `:focus-within` can't tell that apart from a keyboard Tab. Without the
 * `:focus-visible` scoping, every click snapped the whole track backward to `translateX(0)`
 * before the link's `target="_blank"` navigation even happened, which read as the ticker
 * lurching backward on click. `:focus-visible` keeps the keyboard-Tab fix while a mouse click
 * no longer clears the animation at all.
 */
export function PartnerGrid({ partners }: { partners: PublicPartner[] }) {
  if (partners.length === 0) return null;

  const half = repeatToFill(partners);
  const track = [...half, ...half];
  const durationSeconds = half.length * SECONDS_PER_TILE;

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
          <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] border-l border-t border-rule">
            {partners.map((partner, index) => (
              <PartnerTile key={`${partner.name}-${index}`} partner={partner} className={STATIC_TILE} />
            ))}
          </div>
        </div>

        <div data-testid="partner-ticker" className="motion-reduce:hidden overflow-hidden">
          <div
            className="flex w-max motion-safe:animate-marquee has-[:focus-visible]:[animation:none]"
            style={{ animationDuration: `${durationSeconds}s` }}
          >
            {track.map((partner, index) => (
              <PartnerTile
                key={`${partner.name}-${index}`}
                partner={partner}
                hidden={index >= partners.length}
                className={TICKER_TILE}
              />
            ))}
          </div>
        </div>
      </Reveal>
    </div>
  );
}
