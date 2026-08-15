'use client';

import { useEffect, useRef, useState, type RefObject } from 'react';

/**
 * Fires once when the element first scrolls into view, then stops observing — a reveal should
 * announce a section once, not restage it every time the reader scrolls past it again. Falls
 * back to "already in view" (no observation at all) when `IntersectionObserver` isn't available
 * (old browsers, and jsdom in tests) — scroll-gating is a progressive enhancement, not something
 * content should ever be hidden behind if it can't run.
 */
export function useInView<T extends Element>(rootMargin = '0px 0px -10% 0px'): [RefObject<T>, boolean] {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node || typeof IntersectionObserver === 'undefined') {
      setInView(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setInView(true);
          observer.disconnect();
        }
      },
      { rootMargin, threshold: 0.15 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [rootMargin]);

  return [ref, inView];
}
