import type { Metadata } from 'next';
import { getAnakUsahaList, getArticles, getCategories } from '../../lib/api';
import { NEWS_PAGE_SIZE } from '../../lib/newsPageSize';
import { isNewsDateOption, resolveNewsDateRange } from '../../lib/newsDateFilter';
import { Container } from '../../components/layout/Container';
import { NewsExplorer } from '../../components/news/NewsExplorer';

export const metadata: Metadata = {
  title: 'News — Siders',
};

function splitSlugs(value: string | undefined): string[] {
  return value ? value.split(',').filter((slug) => slug.length > 0) : [];
}

/**
 * Of the four anak usaha sub-brands (`0010_bored_silhouette.sql`), only Surabaya Siders and
 * Jakarta Siders publish news articles — Siders Culture and SidersVox never carry articles, so
 * they're excluded from the "Group Companies" filter on this page.
 */
const ARTICLE_ANAK_USAHA_SLUGS = ['surabaya-siders', 'jakarta-siders'];

interface NewsSearchParams {
  category?: string;
  anakUsaha?: string;
  date?: string;
  dateFrom?: string;
  dateTo?: string;
}

/**
 * Server-rendered, `searchParams`-driven, per `docs/ARCHITECTURE.md` §8.1: "filters live in the
 * URL, so results are shareable." No `revalidate` export — every request re-fetches so a
 * newly-published article shows up immediately when a reader lands on a filtered URL.
 */
export default async function NewsPage({ searchParams }: { searchParams: NewsSearchParams }) {
  const categorySlugs = splitSlugs(searchParams.category);
  const anakUsahaSlugs = splitSlugs(searchParams.anakUsaha);
  const dateOption = isNewsDateOption(searchParams.date) ? searchParams.date : undefined;
  const { publishedAfter, publishedBefore } = resolveNewsDateRange(
    dateOption,
    searchParams.dateFrom,
    searchParams.dateTo,
    new Date(),
  );

  const [categories, anakUsahaList, articles] = await Promise.all([
    getCategories({ cache: 'no-store' }),
    getAnakUsahaList({ cache: 'no-store' }),
    getArticles(
      { categorySlugs, anakUsahaSlugs, publishedAfter, publishedBefore, limit: NEWS_PAGE_SIZE, offset: 0 },
      { cache: 'no-store' },
    ),
  ]);

  const anakUsahaOptions = anakUsahaList.filter((entry) =>
    ARTICLE_ANAK_USAHA_SLUGS.includes(entry.slug),
  );

  const explorerKey = [
    categorySlugs.join(','),
    anakUsahaSlugs.join(','),
    dateOption ?? '',
    searchParams.dateFrom ?? '',
    searchParams.dateTo ?? '',
  ].join('|');

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

      <NewsExplorer
        key={explorerKey}
        initialArticles={articles}
        categories={categories}
        anakUsahaOptions={anakUsahaOptions}
        activeCategorySlugs={categorySlugs}
        activeAnakUsahaSlugs={anakUsahaSlugs}
        activeDateOption={dateOption}
        activeDateFrom={searchParams.dateFrom}
        activeDateTo={searchParams.dateTo}
      />
    </Container>
  );
}
