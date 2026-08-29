import type { Metadata } from 'next';
import { Suspense } from 'react';
import { getAnakUsahaList, getCategories } from '../../lib/api';
import { Container } from '../../components/layout/Container';
import { NewsExplorer } from '../../components/news/NewsExplorer';

export const metadata: Metadata = {
  title: 'News — Siders',
};

/**
 * Of the four anak usaha sub-brands (`0010_bored_silhouette.sql`), only Surabaya Siders and
 * Jakarta Siders publish news articles — Siders Culture and SidersVox never carry articles, so
 * they're excluded from the "Group Companies" filter on this page.
 */
const ARTICLE_ANAK_USAHA_SLUGS = ['surabaya-siders', 'jakarta-siders'];

/**
 * Static export (next.config.mjs — `output: 'export'`): a Server Component can no longer read
 * `searchParams` (that forces per-request dynamic rendering, which a static export has no server
 * to do) or fetch with `cache: 'no-store'`. This page now only fetches the two catalogs that
 * don't depend on the URL — `categories` and `anakUsahaOptions`, baked in at build time — and
 * hands filtering, the URL, and the article fetch itself to NewsExplorer entirely client-side.
 * `useSearchParams()` inside NewsExplorer requires the Suspense boundary below.
 */
export default async function NewsPage() {
  const [categories, anakUsahaList] = await Promise.all([
    getCategories(),
    getAnakUsahaList().catch(() => []),
  ]);

  const anakUsahaOptions = anakUsahaList.filter((entry) =>
    ARTICLE_ANAK_USAHA_SLUGS.includes(entry.slug),
  );

  return (
    <Container className="pt-[clamp(24px,4vw,44px)]">
      <div className="flex items-baseline justify-between gap-4 border-b-[3px] border-ink pb-2.5">
        <h1 className="font-serif text-[clamp(28px,4vw,44px)] font-bold uppercase tracking-[0.02em]">
          Hyperlocal News
        </h1>
        <span className="font-sans text-[11px] font-bold uppercase tracking-widest text-muted">
          Archive
        </span>
      </div>

      <Suspense
        fallback={
          <div className="py-[clamp(32px,5vw,64px)] font-sans text-[11px] font-bold uppercase tracking-widest text-muted">
            Loading…
          </div>
        }
      >
        <NewsExplorer categories={categories} anakUsahaOptions={anakUsahaOptions} />
      </Suspense>
    </Container>
  );
}
