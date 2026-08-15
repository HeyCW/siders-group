'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { NavLinks } from './NavLinks';

/**
 * Hidden above the fold (the full masthead is already visible there) and slides in once the
 * reader scrolls past it — `Siders Broadsheet.dc.html`'s own threshold: `scrollY > 240`.
 */
export function StickyNav() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 240);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div
      className="fixed inset-x-0 top-0 z-[60] flex h-14 items-center border-b border-ink bg-paper transition-transform duration-[180ms] ease-[cubic-bezier(.22,1,.36,1)]"
      style={{ transform: scrolled ? 'none' : 'translateY(-101%)' }}
    >
      <div className="mx-auto flex w-full max-w-[1120px] items-baseline justify-between gap-6 px-[clamp(16px,4vw,40px)]">
        <Link href="/" className="font-serif text-lg font-bold tracking-[0.14em]">
          SIDERS
        </Link>
        <NavLinks />
      </div>
    </div>
  );
}
