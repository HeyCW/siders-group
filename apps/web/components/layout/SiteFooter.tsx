import Link from 'next/link';
import { Container } from './Container';
import { CONTACT_INFO, EDITION, FOOTER_DESCRIPTION, NAV_ITEMS } from '../../lib/content';
import type { PresentedAnakUsaha } from '../../lib/anakUsaha';

const colClass = 'py-[clamp(20px,3vw,32px)] px-[clamp(16px,2vw,28px)] border-r border-rule-strong';

/** Anak usaha entries are fetched once by `layout.tsx` (rendered on every page) rather than by
 *  this component itself — Next.js's request memoization dedupes that against the same fetch
 *  made by the home page and Contact page within one request, so there is only ever one network
 *  call for it (design.md - "Public data folded into the existing GET /anak-usaha endpoint"). */
export function SiteFooter({ brands }: { brands: PresentedAnakUsaha[] }) {
  return (
    <Container className="pt-[clamp(32px,5vw,64px)] pb-[clamp(20px,3vw,32px)]">
      <div className="border-t-[3px] border-ink" />
      <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))]">
        <div className={`${colClass} pl-0`}>
          <div className="font-serif text-[clamp(30px,4vw,44px)] font-bold leading-none tracking-[0.10em]">
            SIDERS
          </div>
          <p className="mt-3.5 max-w-[32ch] text-[13px] leading-[1.65] text-muted">
            {FOOTER_DESCRIPTION}
          </p>
        </div>

        <div className={colClass}>
          <div className="border-b border-ink pb-2 font-sans text-[11px] font-bold uppercase tracking-widest">
            Halaman
          </div>
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="group block border-b border-rule py-2.5 text-sm transition-[border-bottom-width,border-color] duration-hover ease-hover hover:border-b-[3px] hover:border-ink focus-visible:border-b-[3px] focus-visible:border-ink"
            >
              <span className="mark-group">{item.label}</span>
            </Link>
          ))}
        </div>

        {brands.length > 0 && (
          <div className={colClass}>
            <div className="border-b border-ink pb-2 font-sans text-[11px] font-bold uppercase tracking-widest">
              Anak Usaha
            </div>
            {brands.map((brand) => (
              <Link
                key={brand.id}
                href="/news"
                className="group flex justify-between gap-3 border-b border-rule py-2.5 text-sm transition-[border-bottom-width,border-color] duration-hover ease-hover hover:border-b-[3px] hover:border-ink focus-visible:border-b-[3px] focus-visible:border-ink"
              >
                <span className="mark-group">{brand.name}</span> <span className="text-muted">↗</span>
              </Link>
            ))}
          </div>
        )}

        <div className="py-[clamp(20px,3vw,32px)] pl-[clamp(16px,2vw,28px)] pr-0">
          <div className="border-b border-ink pb-2 font-sans text-[11px] font-bold uppercase tracking-widest">
            Redaksi
          </div>
          <div className="border-b border-rule py-2.5 text-sm leading-[1.65]">
            {CONTACT_INFO.address.map((line) => (
              <span key={line} className="block">
                {line}
              </span>
            ))}
          </div>
          <a
            href={`mailto:${CONTACT_INFO.emails[0]}`}
            className="group block border-b border-rule py-2.5 text-sm transition-[border-bottom-width,border-color] duration-hover ease-hover hover:border-b-[3px] hover:border-ink focus-visible:border-b-[3px] focus-visible:border-ink"
          >
            <span className="mark-group">{CONTACT_INFO.emails[0]}</span>
          </a>
          <div className="border-b border-rule py-2.5 text-sm">{CONTACT_INFO.whatsapp}</div>
          <div className="flex flex-wrap gap-2 pt-3.5">
            {['Instagram', 'TikTok', 'WhatsApp'].map((social) => (
              <a
                key={social}
                href="#"
                className="mark-hover border-b-2 border-ink pb-0.5 font-sans text-[11px] font-bold uppercase tracking-widest"
              >
                {social}
              </a>
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-3 border-t border-ink pt-3.5">
        <span className="font-sans text-[11px] font-bold uppercase tracking-widest">
          PT. Siders Karya Nusantara
        </span>
        <span className="font-sans text-[11px] font-bold uppercase tracking-widest text-muted">
          {EDITION} · Agustus 2026
        </span>
        <span className="font-sans text-[11px] font-bold uppercase tracking-widest text-muted">
          © 2026 — Hak cipta dilindungi
        </span>
      </div>
    </Container>
  );
}
