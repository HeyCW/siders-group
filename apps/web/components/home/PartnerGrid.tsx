import { PARTNERS } from '../../lib/content';

export function PartnerGrid() {
  return (
    <div className="pt-[clamp(32px,5vw,64px)]">
      <h2 className="border-b border-ink pb-2 font-serif text-xl font-black uppercase tracking-wide">
        Thank You For Always Trusting Us
      </h2>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] border-l border-t border-rule">
        {PARTNERS.map((name, i) => (
          <span
            key={i}
            className="flex h-24 items-center justify-center border-b border-r border-rule font-sans text-[11px] font-bold uppercase tracking-widest text-muted"
          >
            {name}
          </span>
        ))}
      </div>
    </div>
  );
}
