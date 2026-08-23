import Link from 'next/link';
import { CTA_BAND } from '../../lib/content';
import { Reveal } from '../ui/Reveal';

/** Underlined editorial text links, not a solid button — per `chats/chat1.md`: "i dont like the
 *  hubungi kami button in bottom." */
export function CtaBand() {
  return (
    <div className="pt-[clamp(20px,3vw,36px)]">
      <Reveal className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] items-center gap-[clamp(20px,3vw,32px)] border-y-[3px] border-ink py-[clamp(28px,4vw,48px)]">
        <div className="font-serif text-[clamp(26px,3.4vw,40px)] font-bold leading-[1.08] tracking-[-0.03em]">
          {CTA_BAND.headline}
        </div>
        <div className="flex flex-wrap justify-self-start gap-3">
          <Link
            href="/contact"
            className="mark-hover border-b-2 border-ink pb-[3px] font-sans text-[11px] font-bold uppercase tracking-widest"
          >
            Hubungi aja →
          </Link>
          <Link
            href="/news"
            className="mark-hover border-b-2 border-ink pb-[3px] font-sans text-[11px] font-bold uppercase tracking-widest"
          >
            Baca News →
          </Link>
        </div>
      </Reveal>
    </div>
  );
}
