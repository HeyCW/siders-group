import Link from 'next/link';
import { StickyNav } from './StickyNav';
import { NavLinks } from './NavLinks';
import { Container } from './Container';

export function SiteHeader() {
  return (
    <>
      <StickyNav />
      <Container>
        <div className="h-[clamp(24px,4vw,48px)]" />
        <div className="origin-left animate-ruledraw border-t-[3px] border-ink" />
        <div className="py-[clamp(12px,2vw,20px)] pb-[clamp(8px,1.5vw,14px)] text-center">
          <Link
            href="/"
            className="inline-block font-serif text-[clamp(42px,10.5vw,92px)] font-bold leading-none tracking-[0.10em]"
          >
            SIDERS
          </Link>
        </div>
        <div className="origin-left animate-ruledraw border-t border-ink" />
        <div className="flex flex-wrap items-center justify-center gap-4 py-2.5">
          <NavLinks className="-ml-2" />
        </div>
        <div className="border-t-[3px] border-ink" />
      </Container>
    </>
  );
}
