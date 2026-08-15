'use client';

import { useEffect, useRef, useState } from 'react';
import { useInView } from './useInView';

/**
 * Parses a stat string like "100.000.000+" (`lib/content.tsx`'s `STATS`) into its numeric
 * target and counts up to it once the band scrolls into view, re-formatting with the same
 * `id-ID` dot-grouping and suffix every frame so the final frame is byte-identical to the
 * static value. Initial state is the real `value` itself, not zero — so a visitor with
 * JavaScript disabled, or viewing the very first paint before this mounts, always sees the true
 * number rather than a placeholder.
 */
export function CountUp({ value }: { value: string }) {
  const [ref, inView] = useInView<HTMLDivElement>();
  const [display, setDisplay] = useState(value);
  const played = useRef(false);

  useEffect(() => {
    if (!inView || played.current) return;
    played.current = true;

    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return;
    }

    const digits = value.match(/[\d.]+/)?.[0] ?? '';
    const target = Number(digits.replace(/\./g, ''));
    const suffix = value.slice(digits.length);
    if (!digits || !Number.isFinite(target) || target <= 0) return;

    const durationMs = 1100;
    const start = performance.now();
    let frame: number;

    function tick(now: number) {
      const elapsed = Math.min((now - start) / durationMs, 1);
      const eased = 1 - Math.pow(1 - elapsed, 3);
      const current = Math.round(target * eased);
      setDisplay(`${current.toLocaleString('id-ID')}${suffix}`);
      if (elapsed < 1) {
        frame = requestAnimationFrame(tick);
      } else {
        setDisplay(value);
      }
    }
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [inView, value]);

  return <div ref={ref}>{display}</div>;
}
