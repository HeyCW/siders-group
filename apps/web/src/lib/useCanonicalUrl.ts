import { useEffect } from 'react';

/**
 * Points `<link rel="canonical">` at the current route's own URL.
 *
 * Prerendered routes already ship the right canonical in their served HTML, so this only matters
 * for a reader (or a renderer) that arrives by client-side navigation, where every route would
 * otherwise keep claiming `index.html`'s home-page canonical. Same after-mount trade-off as
 * `useDocumentTitle`, and restored on unmount for the same reason.
 */
export function useCanonicalUrl(url: string): void {
  useEffect(() => {
    const tag = document.querySelector('link[rel="canonical"]');
    if (!tag) return;

    const previous = tag.getAttribute('href');
    tag.setAttribute('href', url);
    return () => {
      if (previous !== null) tag.setAttribute('href', previous);
    };
  }, [url]);
}
