import { useEffect } from 'react';

/**
 * The CSR replacement for Next's per-route `metadata` export (making-csr) — there is no
 * server/build step left to bake a `<title>` into the served HTML, so this sets it after mount
 * instead. Deliberately not a full OG/meta-tag solution: a link shared to WhatsApp/social still
 * only sees `index.html`'s static title, since those crawlers don't run JS. That gap is an
 * accepted trade of going fully static-hosting-friendly, not an oversight.
 */
export function useDocumentTitle(title: string): void {
  useEffect(() => {
    const previous = document.title;
    document.title = title;
    return () => {
      document.title = previous;
    };
  }, [title]);
}
