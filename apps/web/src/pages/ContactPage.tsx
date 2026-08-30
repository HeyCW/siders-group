import { useEffect, useState, type ReactNode } from 'react';
import { getAnakUsahaList } from '../lib/api';
import { presentedAnakUsaha, type PresentedAnakUsaha } from '../lib/anakUsaha';
import { useDocumentTitle } from '../lib/useDocumentTitle';
import { Container } from '../components/layout/Container';
import { ContactForm } from '../components/contact/ContactForm';
import { CONTACT_INFO } from '../lib/content';

function InfoRow({
  badge,
  label,
  children,
}: {
  badge: string;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="grid grid-cols-[44px_1fr] items-start gap-4 border-b border-rule py-[18px]">
      <span className="flex h-11 w-11 items-center justify-center bg-ink font-sans text-[11px] font-bold tracking-wider text-paper">
        {badge}
      </span>
      <span>
        <span className="block font-sans text-[11px] font-bold uppercase tracking-widest text-muted">
          {label}
        </span>
        <span className="mt-1.5 block text-[15px] leading-[1.6]">{children}</span>
      </span>
    </div>
  );
}

export function ContactPage() {
  useDocumentTitle('Contact — Siders');

  const [brands, setBrands] = useState<PresentedAnakUsaha[]>([]);

  useEffect(() => {
    let cancelled = false;
    getAnakUsahaList()
      .then((list) => {
        if (!cancelled) setBrands(presentedAnakUsaha(list));
      })
      .catch(() => {
        if (!cancelled) setBrands([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div>
      <Container className="pt-[clamp(24px,4vw,44px)]">
        <div className="border-b-[3px] border-ink pb-3">
          <h1 className="font-serif text-[clamp(28px,4vw,44px)] font-bold uppercase tracking-[0.02em]">
            Contact Us
          </h1>
          <p className="mt-2.5 max-w-[56ch] text-[15px] leading-[1.7] text-muted">
            Partnership, advertising, or you just have a story worth telling.
          </p>
        </div>

        <div className="grid grid-cols-[repeat(auto-fit,minmax(300px,1fr))]">
          <div className="border-r border-rule-strong py-[clamp(20px,3vw,32px)] pr-[clamp(20px,3vw,40px)]">
            <h2 className="border-b border-ink pb-2 font-serif text-xl font-black uppercase tracking-wide">
              Get in touch
            </h2>
            <InfoRow badge="WA" label="WhatsApp">
              {CONTACT_INFO.whatsapp}
              <span className="mt-0.5 block text-[13px] text-muted">
                Fastest route for partnership and advertising enquiries
              </span>
            </InfoRow>
            <InfoRow badge="EM" label="Email us">
              {CONTACT_INFO.emails.map((email) => (
                <span key={email} className="block">
                  {email}
                </span>
              ))}
            </InfoRow>

            <div className="pt-5">
              <div className="font-sans text-[11px] font-bold uppercase tracking-widest text-muted">
                Don&apos;t Miss Out on Our Latest Updates
              </div>
              <a
                href="https://t.me/+jx87X8Lrx4M5ZmM1"
                target="_blank"
                rel="noopener noreferrer"
                className="mark-hover mt-2 inline-flex items-center gap-2 border-b-2 border-ink pb-[3px] text-[20px] font-bold"
              >
                <svg viewBox="0 0 24 24" fill="currentColor" className="h-6 w-6 shrink-0" aria-hidden="true">
                  <path d="M21.94 4.6 18.6 20.36c-.25 1.12-.9 1.4-1.83.87l-5.07-3.74-2.45 2.36c-.27.27-.5.5-1.02.5l.36-5.16 9.4-8.49c.41-.36-.09-.56-.63-.2L6.5 13.08l-5.05-1.58c-1.1-.34-1.12-1.1.23-1.63L20.57 3.24c.91-.34 1.71.2 1.37 1.36Z" />
                </svg>
                Join us on Telegram! →︎
              </a>
              <div className="mt-2.5 flex flex-wrap gap-2">
                {brands.map((brand) => {
                  const link = brand.links[0];
                  const className =
                    'border border-ink px-3 py-2 font-sans text-[11px] font-bold uppercase tracking-widest transition-colors duration-hover ease-hover hover:bg-ink hover:text-paper focus-visible:bg-ink focus-visible:text-paper';
                  // A brand with no link renders as a plain, non-interactive tag rather than a
                  // dead `href="#"` — mirrors `PartnerTile`'s "no website means no link" rule
                  // (apps/web/src/components/home/PartnerGrid.tsx).
                  return link ? (
                    <a key={brand.id} href={link.href} target="_blank" rel="noopener noreferrer" className={className}>
                      {brand.name}
                    </a>
                  ) : (
                    <span key={brand.id} className={className}>
                      {brand.name}
                    </span>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="py-[clamp(20px,3vw,32px)] pl-[clamp(20px,3vw,40px)]">
            <h2 className="border-b border-ink pb-2 font-serif text-xl font-black uppercase tracking-wide">
              Send us a message
            </h2>
            <ContactForm />
          </div>
        </div>
      </Container>
    </div>
  );
}
