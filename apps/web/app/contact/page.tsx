import type { Metadata } from 'next';
import { Container } from '../../components/layout/Container';
import { ContactForm } from '../../components/contact/ContactForm';
import { ContactMap } from '../../components/contact/ContactMap';
import { CONTACT_INFO, SUB_BRANDS } from '../../lib/content';

export const metadata: Metadata = {
  title: 'Contact — Siders',
  description: 'Partnership, advertising, or you just have a story worth telling.',
};

function InfoRow({
  badge,
  label,
  children,
}: {
  badge: string;
  label: string;
  children: React.ReactNode;
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

export default function ContactPage() {
  return (
    <div>
      <Container className="pt-[clamp(24px,4vw,44px)]">
        <div className="border-b-[3px] border-ink pb-3">
          <h1 className="font-serif text-[clamp(28px,4vw,44px)] font-bold uppercase tracking-[0.02em]">
            Contact
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
            <InfoRow badge="HO" label="Head office">
              {CONTACT_INFO.address.map((line) => (
                <span key={line} className="block">
                  {line}
                </span>
              ))}
            </InfoRow>
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
                Follow our sub-brands
              </div>
              <div className="mt-2.5 flex flex-wrap gap-2">
                {SUB_BRANDS.map((brand) => (
                  <a
                    key={brand.name}
                    href="#"
                    className="border border-ink px-3 py-2 font-sans text-[11px] font-bold uppercase tracking-widest transition-colors duration-hover ease-hover hover:bg-ink hover:text-paper focus-visible:bg-ink focus-visible:text-paper"
                  >
                    {brand.name}
                  </a>
                ))}
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

        <div className="pt-[clamp(24px,4vw,40px)]">
          <div className="border-b border-ink pb-2 font-sans text-[11px] font-bold uppercase tracking-widest">
            Find us
          </div>
          <div className="relative mt-3 w-full border border-rule bg-white aspect-[4/3] md:aspect-[21/9]">
            <ContactMap query={CONTACT_INFO.mapQuery} />
          </div>
        </div>
      </Container>
    </div>
  );
}
