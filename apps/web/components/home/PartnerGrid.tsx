import { PARTNERS } from '../../lib/content';
import { Reveal } from '../ui/Reveal';
import { RuleDraw } from '../ui/RuleDraw';

export function PartnerGrid() {
  return (
    <div className="pt-[clamp(32px,5vw,64px)]">
      <Reveal className="pb-2">
        <h2 className="font-serif text-xl font-black uppercase tracking-wide">
          Thank You For Always Trusting Us
        </h2>
      </Reveal>
      <RuleDraw className="border-b border-ink" />
      <Reveal delayMs={90} className="grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] border-l border-t border-rule">
        {PARTNERS.map((name, i) => (
          <span
            key={i}
            className="flex h-24 items-center justify-center border-b border-r border-rule font-sans text-[11px] font-bold uppercase tracking-widest text-muted"
          >
            {name}
          </span>
        ))}
      </Reveal>
    </div>
  );
}
