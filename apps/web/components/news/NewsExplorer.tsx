'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ArticlePublicCard, CategoryResponse } from '@siders/contracts';
import { getArticles } from '../../lib/api';
import { ArticleCard } from './ArticleCard';
import { FilterOption, FilterTrigger } from './FilterTrigger';

const PAGE_SIZE = 6;
const DATE_OPTIONS = ['7 hari terakhir', '30 hari terakhir', 'Tahun ini', 'Rentang khusus'];
const SUB_BRAND_OPTIONS = ['SidersVox', 'Surabaya Siders', 'Jakarta Siders', 'Siders Culture'];

type PopoverKey = 'anak' | 'kat' | 'tgl' | null;

export function NewsExplorer({
  initialArticles,
  categories,
  activeCategorySlug,
}: {
  initialArticles: ArticlePublicCard[];
  categories: CategoryResponse[];
  activeCategorySlug: string | undefined;
}) {
  const router = useRouter();
  const [articles, setArticles] = useState(initialArticles);
  const [hasMore, setHasMore] = useState(initialArticles.length === PAGE_SIZE);
  const [loadingMore, setLoadingMore] = useState(false);
  const [query, setQuery] = useState('');
  const [openPopover, setOpenPopover] = useState<PopoverKey>(null);

  const activeCategory = categories.find((c) => c.slug === activeCategorySlug);
  const hasFilters = Boolean(activeCategorySlug) || query.trim() !== '';

  const searchFiltered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return articles;
    return articles.filter((a) => `${a.title} ${a.excerpt ?? ''}`.toLowerCase().includes(q));
  }, [articles, query]);

  const featured = !hasFilters && searchFiltered.length > 0 ? searchFiltered[0] : undefined;
  const gridItems = featured ? searchFiltered.slice(1) : searchFiltered;

  function togglePopover(key: PopoverKey) {
    setOpenPopover((cur) => (cur === key ? null : key));
  }

  function selectCategory(slug: string | null) {
    setOpenPopover(null);
    router.push(slug ? `/news?category=${encodeURIComponent(slug)}` : '/news');
  }

  async function loadMore() {
    setLoadingMore(true);
    try {
      const next = await getArticles({
        categorySlug: activeCategorySlug,
        limit: PAGE_SIZE,
        offset: articles.length,
      });
      setArticles((prev) => [...prev, ...next]);
      setHasMore(next.length === PAGE_SIZE);
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <div>
      <div className="border-b border-rule py-[clamp(16px,2.5vw,24px)]">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search this page…"
          className="w-full border-0 border-b-2 border-ink bg-transparent py-2.5 text-[clamp(16px,2vw,20px)] outline-none"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2.5 border-b border-rule py-[clamp(14px,2vw,20px)]">
        <FilterTrigger
          label="Anak usaha"
          active={false}
          open={openPopover === 'anak'}
          onToggle={() => togglePopover('anak')}
        >
          <span className="block border-b border-rule pb-2.5 font-sans text-[11px] font-bold uppercase tracking-widest text-muted">
            Anak usaha — pilih satu
          </span>
          {SUB_BRAND_OPTIONS.map((label) => (
            <FilterOption key={label} label={label} selected={false} onClick={() => {}} />
          ))}
        </FilterTrigger>

        <FilterTrigger
          label="Kategori"
          valueLabel={activeCategory ? '1' : undefined}
          active={Boolean(activeCategory)}
          open={openPopover === 'kat'}
          onToggle={() => togglePopover('kat')}
        >
          <span className="block border-b border-rule pb-2.5 font-sans text-[11px] font-bold uppercase tracking-widest text-muted">
            Kategori — pilih satu
          </span>
          {categories.map((cat) => (
            <FilterOption
              key={cat.id}
              label={cat.name}
              selected={cat.slug === activeCategorySlug}
              onClick={() => selectCategory(cat.slug === activeCategorySlug ? null : cat.slug)}
            />
          ))}
          {activeCategory && (
            <button
              type="button"
              onClick={() => selectCategory(null)}
              className="mt-3 border-2 border-ink px-3.5 py-2 font-sans text-[11px] font-bold uppercase tracking-widest"
            >
              Reset
            </button>
          )}
        </FilterTrigger>

        <FilterTrigger
          label="Tanggal"
          active={false}
          open={openPopover === 'tgl'}
          onToggle={() => togglePopover('tgl')}
        >
          <span className="block border-b border-rule pb-2.5 font-sans text-[11px] font-bold uppercase tracking-widest text-muted">
            Tanggal — pilih satu
          </span>
          {DATE_OPTIONS.map((label) => (
            <FilterOption key={label} label={label} selected={false} onClick={() => {}} />
          ))}
        </FilterTrigger>

        <button
          type="button"
          className="ml-auto inline-flex items-center gap-2 whitespace-nowrap border border-ink px-3.5 py-2 font-sans text-[11px] font-bold uppercase tracking-widest transition-colors duration-hover ease-hover hover:bg-ink hover:text-paper focus-visible:bg-ink focus-visible:text-paper"
        >
          Urutkan: Terbaru ⇅
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2.5 border-b border-rule py-3.5">
        {activeCategory && (
          <button
            type="button"
            onClick={() => selectCategory(null)}
            className="inline-flex items-center gap-2 bg-signal px-3 py-1.5 font-sans text-[11px] font-bold uppercase tracking-widest transition-colors duration-hover ease-hover hover:bg-ink hover:text-signal focus-visible:bg-ink focus-visible:text-signal"
          >
            Kategori{' '}
            <span className="font-serif font-bold normal-case tracking-normal">
              {activeCategory.name}
            </span>{' '}
            ×
          </button>
        )}
        {hasFilters && (
          <button
            type="button"
            onClick={() => {
              setQuery('');
              selectCategory(null);
            }}
            className="border-b-2 border-ink pb-0.5 font-sans text-[11px] font-bold uppercase tracking-widest"
          >
            Hapus semua
          </button>
        )}
        <span className="ml-auto font-sans text-[11px] font-bold uppercase tracking-widest text-muted">
          {searchFiltered.length} {searchFiltered.length === 1 ? 'story' : 'stories'}
        </span>
      </div>

      {featured && <ArticleCard article={featured} featured />}

      <div className="grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))]">
        {gridItems.map((article) => (
          <ArticleCard key={article.id} article={article} />
        ))}
      </div>

      {searchFiltered.length === 0 && (
        <div className="border-b border-ink py-[clamp(32px,5vw,64px)]">
          <div className="font-sans text-[11px] font-bold uppercase tracking-widest text-muted">
            Tidak ada hasil
          </div>
          <div className="my-3.5 max-w-[34ch] font-serif text-[clamp(24px,3vw,34px)] font-bold leading-[1.1] tracking-[-0.03em]">
            {activeCategorySlug
              ? 'Kategori ini belum punya cerita yang cocok dengan pencarianmu.'
              : 'Pencarianmu tidak menemukan cerita apa pun di halaman ini.'}
          </div>
          <button
            type="button"
            onClick={() => {
              setQuery('');
              selectCategory(null);
            }}
            className="bg-ink px-[18px] py-3 font-sans text-[11px] font-bold uppercase tracking-widest text-paper"
          >
            Hapus semua filter
          </button>
        </div>
      )}

      {hasMore && (
        <div className="flex justify-center py-[clamp(24px,4vw,40px)]">
          <button
            type="button"
            disabled={loadingMore}
            onClick={loadMore}
            className="border-2 border-ink px-7 py-3.5 font-sans text-[11px] font-bold uppercase tracking-widest transition-colors duration-hover ease-hover hover:bg-ink hover:text-paper focus-visible:bg-ink focus-visible:text-paper disabled:opacity-50"
          >
            {loadingMore ? 'Loading…' : 'Load more'}
          </button>
        </div>
      )}
    </div>
  );
}
