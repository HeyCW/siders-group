import { useEffect } from 'react';

/**
 * Same trade-off as `useDocumentTitle`: sets `<meta name="description">` after mount, which
 * Googlebot's rendered-DOM crawl picks up but pre-JS crawlers (social link previews) never see —
 * those still fall back to `index.html`'s static description.
 */
export function useMetaDescription(description: string): void {
  useEffect(() => {
    const tag = document.querySelector('meta[name="description"]');
    if (!tag) return;

    const previous = tag.getAttribute('content');
    tag.setAttribute('content', description);
    return () => {
      if (previous !== null) tag.setAttribute('content', previous);
    };
  }, [description]);
}
