import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { NavLinks } from './NavLinks';
import { ReaderControl } from './ReaderControl';

/**
 * Hidden above the fold (the full masthead is already visible there) and slides in once the
 * reader scrolls past it — `Siders Broadsheet.dc.html`'s own threshold: `scrollY > 240`.
 *
 * Below `lg` there isn't room for "SIDERS" plus all four nav labels plus a signed-in reader's
 * name in one 56px row — "Hyperlocal News" and "Behind The Siders" alone push a phone-width bar
 * into wrapping or clipping. So under `lg` the inline group collapses behind a Menu/Close
 * toggle that drops a stacked panel below the bar instead; `lg` and up keep the original
 * single-row layout unchanged.
 */
export function StickyNav() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = useLocation().pathname;

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 240);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // A route change is the signal that a nav link (or ReaderControl's sign-in/out) was just
  // used, so the panel that triggered it should close.
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  return (
    <div
      className="fixed inset-x-0 top-0 z-[60] border-b border-ink bg-paper transition-transform duration-[180ms] ease-[cubic-bezier(.22,1,.36,1)]"
      style={{ transform: scrolled ? 'none' : 'translateY(-101%)' }}
    >
      <div className="mx-auto flex h-14 w-full max-w-[1120px] items-center justify-between gap-6 px-[clamp(16px,4vw,40px)]">
        <Link to="/" className="font-serif text-lg font-bold tracking-[0.14em]">
          SIDERS
        </Link>
        {/* Grouped so the row stays two-child and `justify-between` keeps NavLinks where it
            was — ReaderControl joins the existing right-hand space rather than becoming a
            third flex item that would re-center it (design.md - "The utility slot renders in
            both header surfaces"). */}
        <div className="hidden items-center gap-4 lg:flex">
          <NavLinks />
          <ReaderControl className="shrink-0" />
        </div>
        <button
          type="button"
          onClick={() => setMenuOpen((open) => !open)}
          aria-expanded={menuOpen}
          aria-controls="sticky-nav-menu"
          className="border border-ink px-3 py-1.5 font-sans text-[11px] font-bold uppercase tracking-widest lg:hidden"
        >
          {menuOpen ? 'Close' : 'Menu'}
        </button>
      </div>
      {menuOpen && (
        <div id="sticky-nav-menu" className="border-t border-rule bg-paper px-[clamp(16px,4vw,40px)] pb-4 lg:hidden">
          <NavLinks stacked />
          <div className="border-t border-ink pt-3.5">
            <ReaderControl />
          </div>
        </div>
      )}
    </div>
  );
}
