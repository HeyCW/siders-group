import type { ReactNode } from 'react';
import { Reveal } from '../ui/Reveal';
import { RuleDraw } from '../ui/RuleDraw';

/** The heading row repeated across every homepage section: title, trailing label, a rule
 *  beneath that draws itself in the first time the section scrolls into view. */
export function SectionHeading({ title, trailing }: { title: string; trailing?: ReactNode }) {
  return (
    <div>
      <Reveal className="flex items-baseline justify-between gap-4 pb-2">
        <h2 className="font-serif text-xl font-black uppercase tracking-wide">{title}</h2>
        {trailing !== undefined && (
          <span className="font-sans text-[11px] font-bold uppercase tracking-widest text-muted">
            {trailing}
          </span>
        )}
      </Reveal>
      <RuleDraw className="border-b border-ink" />
    </div>
  );
}
