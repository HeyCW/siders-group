import { useInView } from './useInView';

/** A section-divider rule that draws itself left-to-right the first time it scrolls into
 *  view — the scroll-triggered sibling of the masthead's on-load `animate-ruledraw`. Caller
 *  supplies the border/spacing classes (`border-b border-ink`, etc.); this only owns the draw. */
export function RuleDraw({ className = '' }: { className?: string }) {
  const [ref, inView] = useInView<HTMLDivElement>();
  return (
    <div
      ref={ref}
      className={`origin-left transition-transform duration-[420ms] ease-[cubic-bezier(.22,1,.36,1)] motion-reduce:!scale-x-100 motion-reduce:transition-none ${
        inView ? 'scale-x-100' : 'scale-x-0'
      } ${className}`}
    />
  );
}
