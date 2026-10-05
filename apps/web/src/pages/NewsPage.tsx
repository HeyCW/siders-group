import { useEffect, useState } from 'react';
import type { AnakUsahaResponse, CategoryResponse } from '@siders/contracts';
import { getAnakUsahaList, getCategories } from '../lib/api';
import { Container } from '../components/layout/Container';
import { NewsExplorer } from '../components/news/NewsExplorer';
import { useDocumentTitle } from '../lib/useDocumentTitle';
import { useMetaDescription } from '../lib/useMetaDescription';

export function NewsPage() {
  useDocumentTitle('Hyperlocal News — Siders');
  useMetaDescription(
    'Read the latest hyperlocal news, stories, and community updates from Siders — covering Surabaya, Jakarta, and the brands connected to them.',
  );

  const [categories, setCategories] = useState<CategoryResponse[]>([]);
  const [anakUsahaOptions, setAnakUsahaOptions] = useState<AnakUsahaResponse[]>([]);
  const [loadingCatalogs, setLoadingCatalogs] = useState(true);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getCategories(), getAnakUsahaList().catch(() => [])])
      .then(([categoryList, anakUsahaList]) => {
        if (cancelled) return;
        setCategories(categoryList);
        // Every anak perusahaan managed in admin is a filter option — any of them can be set on
        // an article, so none is excluded here.
        setAnakUsahaOptions(anakUsahaList);
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
