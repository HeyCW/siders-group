import Link from 'next/link';
import { StickyNav } from './StickyNav';
import { NavLinks } from './NavLinks';
import { Container } from './Container';
import { ReaderControl } from './ReaderControl';

export function SiteHeader() {
  return (
    <>
      <StickyNav />
      <Container>
        <div className="h-[clamp(16px,3vw,32px)]" />
        {/* Dateline row — masthead furniture, not app chrome (design.md - "The utility slot
            renders in both header surfaces"). */}
        <div className="flex justify-end">
          <ReaderControl />
        </div>
        <div className="h-[clamp(8px,1vw,16px)]" />
        <div className="origin-left motion-safe:animate-ruledraw border-t-[3px] border-ink" />
        <div className="py-[clamp(12px,2vw,20px)] pb-[clamp(8px,1.5vw,14px)] text-center">
          <Link
            href="/"
            className="motion-safe:animate-inkfade inline-block font-serif text-[clamp(42px,10.5vw,92px)] font-bold leading-none tracking-[0.10em]"
            style={{ animationDelay: '120ms' }}
          >
            SIDERS
          </Link>
        </div>
        <div className="origin-left motion-safe:animate-ruledraw border-t border-ink" />
        <div className="flex flex-wrap items-center justify-center gap-4 py-2.5">
          <NavLinks className="-ml-2" />
        </div>
        <div className="border-t-[3px] border-ink" />
      </Container>
    </>
  );
}
