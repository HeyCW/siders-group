import Link from 'next/link';
import { Container } from './Container';
import {
  CONTACT_INFO,
  EDITION,
  FOOTER_DESCRIPTION,
  NAV_ITEMS,
  SUB_BRANDS,
} from '../../lib/content';

const colClass = 'py-[clamp(20px,3vw,32px)] px-[clamp(16px,2vw,28px)] border-r border-rule-strong';

export function SiteFooter() {
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
              className="block border-b border-rule py-2.5 text-sm hover:bg-signal"
            >
              {item.label}
            </Link>
          ))}
        </div>

        <div className={colClass}>
          <div className="border-b border-ink pb-2 font-sans text-[11px] font-bold uppercase tracking-widest">
            Anak Usaha
          </div>
          {SUB_BRANDS.map((brand) => (
            <Link
              key={brand.name}
              href="/news"
              className="flex justify-between gap-3 border-b border-rule py-2.5 text-sm hover:bg-signal"
            >
              {brand.name} <span className="text-muted">↗</span>
            </Link>
          ))}
        </div>

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
            className="block border-b border-rule py-2.5 text-sm hover:bg-signal"
          >
            {CONTACT_INFO.emails[0]}
          </a>
          <div className="border-b border-rule py-2.5 text-sm">{CONTACT_INFO.whatsapp}</div>
          <div className="flex flex-wrap gap-2 pt-3.5">
            {['Instagram', 'TikTok', 'WhatsApp'].map((social) => (
              <a
                key={social}
                href="#"
                className="border-b-2 border-ink pb-0.5 font-sans text-[11px] font-bold uppercase tracking-widest hover:bg-signal"
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
