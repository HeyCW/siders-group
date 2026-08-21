import type { ReactNode } from 'react';
import { Source_Serif_4, Libre_Franklin } from 'next/font/google';
import { SiteHeader } from '../components/layout/SiteHeader';
import { SiteFooter } from '../components/layout/SiteFooter';
import { ReaderSessionProvider } from '../lib/readerSession';
import { getAnakUsahaList } from '../lib/api';
import { presentedAnakUsaha } from '../lib/anakUsaha';
import './globals.css';

const sourceSerif = Source_Serif_4({
  subsets: ['latin'],
  weight: ['400', '700', '900'],
  variable: '--font-serif',
  display: 'swap',
});

const libreFranklin = Libre_Franklin({
  subsets: ['latin'],
  weight: ['400', '500', '700'],
  variable: '--font-sans',
  display: 'swap',
});

export const metadata = {
  title: 'Siders',
  description: 'Everyone has a voice. Everyone has a story. Everyone is Siders.',
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  // Failing to load anak usaha data degrades to an empty footer section rather than taking the
  // whole site down — same treatment as `getPartners()`/`getGuidePicks()` on the home page.
  const anakUsahaList = await getAnakUsahaList({ next: { revalidate: 60 } }).catch(() => []);
  const brands = presentedAnakUsaha(anakUsahaList);

  return (
    <html lang="en" className={`${sourceSerif.variable} ${libreFranklin.variable}`}>
      <body className="min-h-screen bg-paper font-serif text-ink">
        <ReaderSessionProvider>
          <SiteHeader />
          {children}
          <SiteFooter brands={brands} />
        </ReaderSessionProvider>
      </body>
    </html>
  );
}
