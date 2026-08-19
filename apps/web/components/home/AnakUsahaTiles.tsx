import Image from 'next/image';
import Link from 'next/link';
import { SUB_BRANDS } from '../../lib/content';
import { Reveal } from '../ui/Reveal';
import { RuleDraw } from '../ui/RuleDraw';

/** Tiles link to `/news` — there is no per-sub-brand page (`proposal.md` — Non-Goals). */
export function AnakUsahaTiles() {
  return (
    <div className="pt-[clamp(20px,3vw,40px)]">
      <Reveal className="pb-2">
        <h2 className="font-serif text-xl font-black uppercase tracking-wide">Anak Usaha</h2>
      </Reveal>
      <RuleDraw className="border-b border-ink" />
      <Reveal
        delayMs={90}
        className="grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-[clamp(14px,2vw,24px)] py-[clamp(16px,2.5vw,24px)]"
      >
        {SUB_BRANDS.map((brand) => (
          <Link key={brand.name} href="/news" className="block">
            <span
              className="flex h-[clamp(96px,11vw,140px)] items-center justify-center border border-rule p-2"
              style={{ background: brand.tile }}
            >
              <Image
                src={brand.logo}
                alt={brand.name}
                width={140}
                height={140}
                className="h-full w-full object-contain"
              />
            </span>
            <span className="mt-3 block font-sans text-[11px] font-bold uppercase tracking-widest text-muted">
              {brand.kind}
            </span>
          </Link>
        ))}
      </Reveal>
    </div>
  );
}
