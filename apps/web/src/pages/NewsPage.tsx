import { useEffect, useState } from 'react';
import type { AnakUsahaResponse, CategoryResponse } from '@siders/contracts';
import { getAnakUsahaList, getCategories } from '../lib/api';
import { Container } from '../components/layout/Container';
import { NewsExplorer } from '../components/news/NewsExplorer';
import { useDocumentTitle } from '../lib/useDocumentTitle';

/**
 * Of the four anak usaha sub-brands (`0010_bored_silhouette.sql`), only Surabaya Siders and
 * Jakarta Siders publish news articles — Siders Culture and SidersVox never carry articles, so
 * they're excluded from the "Group Companies" filter on this page.
 */
const ARTICLE_ANAK_USAHA_SLUGS = ['surabaya-siders', 'jakarta-siders'];

export function NewsPage() {
  useDocumentTitle('News — Siders');

  const [categories, setCategories] = useState<CategoryResponse[]>([]);
  const [anakUsahaOptions, setAnakUsahaOptions] = useState<AnakUsahaResponse[]>([]);
  const [loadingCatalogs, setLoadingCatalogs] = useState(true);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getCategories(), getAnakUsahaList().catch(() => [])])
      .then(([categoryList, anakUsahaList]) => {
        if (cancelled) return;
        setCategories(categoryList);
        setAnakUsahaOptions(anakUsahaList.filter((entry) => ARTICLE_ANAK_USAHA_SLUGS.includes(entry.slug)));
      })
      .finally(() => {
        if (!cancelled) setLoadingCatalogs(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

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

      {loadingCatalogs ? (
        <div className="py-[clamp(32px,5vw,64px)] font-sans text-[11px] font-bold uppercase tracking-widest text-muted">
          Loading…
        </div>
      ) : (
        <NewsExplorer categories={categories} anakUsahaOptions={anakUsahaOptions} />
      )}
    </Container>
  );
}
