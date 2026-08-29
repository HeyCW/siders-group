import { useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import { SiteHeader } from '../components/layout/SiteHeader';
import { SiteFooter } from '../components/layout/SiteFooter';
import { ReaderSessionProvider } from '../lib/readerSession';
import { getAnakUsahaList } from '../lib/api';
import { presentedAnakUsaha, type PresentedAnakUsaha } from '../lib/anakUsaha';

/**
 * Rendered on every route (making-csr: the app is now a client-rendered SPA, so there is no
 * server-side request memoization left to dedupe this against the home/contact pages' own
 * `getAnakUsahaList()` call the way Next's fetch cache used to — each fetches independently now).
 * Failing to load anak usaha data degrades to an empty footer section rather than taking the
 * whole site down, same treatment as the home page's own partner/guide-pick fetches.
 */
export function SiteLayout() {
  const [brands, setBrands] = useState<PresentedAnakUsaha[]>([]);

  useEffect(() => {
    let cancelled = false;
    getAnakUsahaList()
      .then((list) => {
        if (!cancelled) setBrands(presentedAnakUsaha(list));
      })
      .catch(() => {
        if (!cancelled) setBrands([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <ReaderSessionProvider>
      <SiteHeader />
      <Outlet />
      <SiteFooter brands={brands} />
    </ReaderSessionProvider>
  );
}
