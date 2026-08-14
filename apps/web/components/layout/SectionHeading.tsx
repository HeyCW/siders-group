import type { ReactNode } from 'react';

/** The heading row repeated across every homepage section: title, trailing label, rule beneath. */
export function SectionHeading({ title, trailing }: { title: string; trailing?: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-ink pb-2">
      <h2 className="font-serif text-xl font-black uppercase tracking-wide">{title}</h2>
      {trailing !== undefined && (
        <span className="font-sans text-[11px] font-bold uppercase tracking-widest text-muted">
          {trailing}
        </span>
      )}
    </div>
  );
}
