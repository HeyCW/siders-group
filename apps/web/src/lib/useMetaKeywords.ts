import { useEffect } from 'react';

/**
 * Same after-mount trade-off as `useMetaDescription`: Googlebot's rendered-DOM crawl picks this
 * up, pre-JS crawlers never do. Unlike description, `index.html` ships no
 * `<meta name="keywords">` tag at all (it carries no SEO weight for crawlers, but it's still the
 * source for the visible chips on the article page) — so this hook creates the tag itself when
 * missing and removes it again on cleanup, but only if it was the one that added it. An empty
 * value adds no tag rather than an empty one.
 */
export function useMetaKeywords(keywords: string): void {
  useEffect(() => {
    if (!keywords) return;

    let tag = document.querySelector('meta[name="keywords"]');
    const created = !tag;
    if (!tag) {
      tag = document.createElement('meta');
      tag.setAttribute('name', 'keywords');
      document.head.appendChild(tag);
    }

    const previous = tag.getAttribute('content');
    tag.setAttribute('content', keywords);
    return () => {
      if (created) {
        tag?.remove();
      } else if (previous !== null) {
        tag?.setAttribute('content', previous);
      }
    };
  }, [keywords]);
}
