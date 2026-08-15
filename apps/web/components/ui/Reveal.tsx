'use client';

import type { ReactNode } from 'react';
import { useInView } from './useInView';

/**
 * The homepage's scroll-triggered reveal: content fades and rises into place once, the first
 * time it enters the viewport — the scrolling sibling of the masthead's on-load rule-draw, so
 * the page keeps "setting itself" in front of the reader as they move down it. `motion-reduce:`
 * forces the revealed state immediately and drops the transition entirely, independent of the
 * scroll-driven state below it, so a reduced-motion visitor never sees so much as a fade.
 */
export function Reveal({
  children,
  className = '',
  delayMs = 0,
}: {
  children: ReactNode;
  className?: string;
  delayMs?: number;
}) {
  const [ref, inView] = useInView<HTMLDivElement>();
  return (
    <div
      ref={ref}
      className={`transition-[opacity,transform] duration-[560ms] ease-[cubic-bezier(.22,1,.36,1)] motion-reduce:!opacity-100 motion-reduce:!translate-y-0 motion-reduce:transition-none ${
        inView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'
      } ${className}`}
      style={{ transitionDelay: `${delayMs}ms` }}
    >
      {children}
    </div>
  );
}
