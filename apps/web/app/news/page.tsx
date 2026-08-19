import type { Metadata } from 'next';
import { getArticles, getCategories } from '../../lib/api';
import { NEWS_PAGE_SIZE } from '../../lib/newsPageSize';
import { Container } from '../../components/layout/Container';
import { NewsExplorer } from '../../components/news/NewsExplorer';

export const metadata: Metadata = {
  title: 'News — Siders',
};

/**
 * Server-rendered, `searchParams`-driven, per `docs/ARCHITECTURE.md` §8.1: "filters live in the
 * URL, so results are shareable." No `revalidate` export — every request re-fetches so a
 * newly-published article shows up immediately when a reader lands on a category filter.
 */
export default async function NewsPage({ searchParams }: { searchParams: { category?: string } }) {
  const categorySlug = searchParams.category;

  const [categories, articles] = await Promise.all([
    getCategories({ cache: 'no-store' }),
    getArticles({ categorySlug, limit: NEWS_PAGE_SIZE, offset: 0 }, { cache: 'no-store' }),
  ]);

  return (
    <Container className="pt-[clamp(24px,4vw,44px)]">
      <div className="flex items-baseline justify-between gap-4 border-b-[3px] border-ink pb-2.5">
        <h1 className="font-serif text-[clamp(28px,4vw,44px)] font-bold uppercase tracking-[0.02em]">
          News
        </h1>
        <span className="font-sans text-[11px] font-bold uppercase tracking-widest text-muted">
          Archive
        </span>
      </div>

      <NewsExplorer
        key={categorySlug ?? 'all'}
        initialArticles={articles}
        categories={categories}
        activeCategorySlug={categorySlug}
      />
    </Container>
  );
}
