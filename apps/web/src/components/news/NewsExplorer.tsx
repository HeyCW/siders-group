import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { AnakUsahaResponse, ArticlePublicCard, CategoryResponse } from '@siders/contracts';
import { getArticles } from '../../lib/api';
import { NEWS_PAGE_SIZE } from '../../lib/newsPageSize';
import {
  NEWS_DATE_OPTIONS,
  isNewsDateOption,
  resolveNewsDateRange,
  type NewsDateOption,
} from '../../lib/newsDateFilter';
import { ArticleCard } from './ArticleCard';
import { FilterOption, FilterTrigger } from './FilterTrigger';

type PopoverKey = 'anak' | 'kat' | 'tgl' | null;

interface ActiveFilters {
  categorySlugs: string[];
  anakUsahaSlugs: string[];
  dateOption: NewsDateOption | undefined;
  dateFrom: string | undefined;
  dateTo: string | undefined;
}

function buildNewsUrl(filters: ActiveFilters): string {
  const params = new URLSearchParams();
  if (filters.categorySlugs.length > 0) params.set('category', filters.categorySlugs.join(','));
  if (filters.anakUsahaSlugs.length > 0) params.set('anakUsaha', filters.anakUsahaSlugs.join(','));
  if (filters.dateOption) {
    params.set('date', filters.dateOption);
    if (filters.dateOption === 'custom') {
      if (filters.dateFrom) params.set('dateFrom', filters.dateFrom);
      if (filters.dateTo) params.set('dateTo', filters.dateTo);
    }
  }
  const qs = params.toString();
  return qs ? `/news?${qs}` : '/news';
}

function toggle(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((entry) => entry !== value) : [...list, value];
}

function splitSlugs(value: string | null): string[] {
  return value ? value.split(',').filter((slug) => slug.length > 0) : [];
}

export function NewsExplorer({
  categories,
  anakUsahaOptions,
}: {
  categories: CategoryResponse[];
  anakUsahaOptions: AnakUsahaResponse[];
}) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // making-csr: this component derives active filters from the URL itself and owns the article
  // fetch — including the very first page, which used to arrive as a server-fetched
  // `initialArticles` prop under Next. That trades an instant server-rendered first paint for a
  // brief client-side loading state on every visit to `/news`.
  const activeCategorySlugs = useMemo(
    () => splitSlugs(searchParams.get('category')),
    [searchParams],
  );
  const activeAnakUsahaSlugs = useMemo(
    () => splitSlugs(searchParams.get('anakUsaha')),
    [searchParams],
  );
  const rawDate = searchParams.get('date') ?? undefined;
  const activeDateOption = isNewsDateOption(rawDate) ? rawDate : undefined;
  const activeDateFrom = searchParams.get('dateFrom') ?? undefined;
  const activeDateTo = searchParams.get('dateTo') ?? undefined;

  const [articles, setArticles] = useState<ArticlePublicCard[]>([]);
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [query, setQuery] = useState('');
  const [openPopover, setOpenPopover] = useState<PopoverKey>(null);
  // Tanggal is the one filter with a two-step commit (pick "Rentang khusus", then fill in and
  // apply a range), so its popover needs a draft selection distinct from the committed,
  // URL-sourced `activeDateOption` prop — otherwise the custom-range inputs could only appear
  // after a full round trip through the URL and back (design.md - "Date range").
  const [draftDateOption, setDraftDateOption] = useState<NewsDateOption | undefined>(activeDateOption);
  const [dateFromDraft, setDateFromDraft] = useState(activeDateFrom ?? '');
  const [dateToDraft, setDateToDraft] = useState(activeDateTo ?? '');

  const activeCategories = categories.filter((c) => activeCategorySlugs.includes(c.slug));
  const activeAnakUsaha = anakUsahaOptions.filter((a) => activeAnakUsahaSlugs.includes(a.slug));
  const activeDateLabel = NEWS_DATE_OPTIONS.find((o) => o.value === activeDateOption)?.label;
  const hasFilters =
    activeCategorySlugs.length > 0 ||
    activeAnakUsahaSlugs.length > 0 ||
    Boolean(activeDateOption) ||
    query.trim() !== '';

  const searchFiltered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return articles;
    return articles.filter((a) => `${a.title} ${a.excerpt ?? ''}`.toLowerCase().includes(q));
  }, [articles, query]);

  const featured = !hasFilters && searchFiltered.length > 0 ? searchFiltered[0] : undefined;
  const gridItems = featured ? searchFiltered.slice(1) : searchFiltered;

  // One key string per distinct filter combination, used below to re-fetch whenever any of them
  // changes.
  const filterKey = [
    activeCategorySlugs.join(','),
    activeAnakUsahaSlugs.join(','),
    activeDateOption ?? '',
    activeDateFrom ?? '',
    activeDateTo ?? '',
  ].join('|');

  useEffect(() => {
    let cancelled = false;
    setLoadingInitial(true);
    const { publishedAfter, publishedBefore } = resolveNewsDateRange(
      activeDateOption,
      activeDateFrom,
      activeDateTo,
      new Date(),
    );
    getArticles({
      categorySlugs: activeCategorySlugs,
      anakUsahaSlugs: activeAnakUsahaSlugs,
      publishedAfter,
      publishedBefore,
      limit: NEWS_PAGE_SIZE,
      offset: 0,
    })
      .then((result) => {
        if (cancelled) return;
        setArticles(result);
        setHasMore(result.length === NEWS_PAGE_SIZE);
      })
      .finally(() => {
        if (!cancelled) setLoadingInitial(false);
      });
    return () => {
      cancelled = true;
    };
    // Re-fetches whenever the URL's filters change — everything the fetch needs is derived from
    // `filterKey` alone, so it's the only dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey]);

  function togglePopover(key: PopoverKey) {
    setOpenPopover((cur) => (cur === key ? null : key));
  }

  function pushFilters(overrides: Partial<ActiveFilters>) {
    navigate(
      buildNewsUrl({
        categorySlugs: activeCategorySlugs,
        anakUsahaSlugs: activeAnakUsahaSlugs,
        dateOption: activeDateOption,
        dateFrom: activeDateFrom,
        dateTo: activeDateTo,
        ...overrides,
      }),
    );
  }

  function toggleCategory(slug: string) {
    pushFilters({ categorySlugs: toggle(activeCategorySlugs, slug) });
  }

  function toggleAnakUsaha(slug: string) {
    pushFilters({ anakUsahaSlugs: toggle(activeAnakUsahaSlugs, slug) });
  }

  function selectDate(option: NewsDateOption) {
    const next = option === draftDateOption ? undefined : option;
    setDraftDateOption(next);
    // Only a non-custom pick commits immediately; "Rentang khusus" waits for Terapkan so an
    // incomplete range never gets pushed to the URL.
    if (next !== 'custom') {
      setOpenPopover(null);
      pushFilters({ dateOption: next, dateFrom: undefined, dateTo: undefined });
    }
  }

  function applyCustomRange() {
    if (!dateFromDraft || !dateToDraft) return;
    setOpenPopover(null);
    pushFilters({ dateOption: 'custom', dateFrom: dateFromDraft, dateTo: dateToDraft });
  }

  function resetDate() {
    setDraftDateOption(undefined);
    setDateFromDraft('');
    setDateToDraft('');
    pushFilters({ dateOption: undefined, dateFrom: undefined, dateTo: undefined });
  }

  function clearAllFilters() {
    setQuery('');
    setDraftDateOption(undefined);
    setDateFromDraft('');
    setDateToDraft('');
    navigate('/news');
  }

  async function loadMore() {
    setLoadingMore(true);
    try {
      const { publishedAfter, publishedBefore } = resolveNewsDateRange(
        activeDateOption,
        activeDateFrom,
        activeDateTo,
        new Date(),
      );
      const next = await getArticles({
        categorySlugs: activeCategorySlugs,
        anakUsahaSlugs: activeAnakUsahaSlugs,
        publishedAfter,
        publishedBefore,
        limit: NEWS_PAGE_SIZE,
        offset: articles.length,
      });
      setArticles((prev) => [...prev, ...next]);
      setHasMore(next.length === NEWS_PAGE_SIZE);
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

      <div className="flex flex-wrap items-center justify-between gap-2.5 border-b border-rule py-[clamp(14px,2vw,20px)]">
        <div className="flex flex-wrap items-center gap-2.5">
          <FilterTrigger
            label="Group Companies"
            valueLabel={activeAnakUsaha.length > 0 ? String(activeAnakUsaha.length) : undefined}
            active={activeAnakUsaha.length > 0}
            open={openPopover === 'anak'}
            onToggle={() => togglePopover('anak')}
          >
            <span className="block border-b border-rule pb-2.5 font-sans text-[11px] font-bold uppercase tracking-widest text-muted">
              Group Companies — pilih beberapa
            </span>
            {anakUsahaOptions.map((entry) => (
              <FilterOption
                key={entry.id}
                label={entry.name}
                selected={activeAnakUsahaSlugs.includes(entry.slug)}
                onClick={() => toggleAnakUsaha(entry.slug)}
              />
            ))}
            {activeAnakUsahaSlugs.length > 0 && (
              <button
                type="button"
                onClick={() => pushFilters({ anakUsahaSlugs: [] })}
                className="mt-3 border-2 border-ink px-3.5 py-2 font-sans text-[11px] font-bold uppercase tracking-widest"
              >
                Reset
              </button>
            )}
          </FilterTrigger>

          <FilterTrigger
            label="Kategori"
            valueLabel={activeCategories.length > 0 ? String(activeCategories.length) : undefined}
            active={activeCategories.length > 0}
            open={openPopover === 'kat'}
            onToggle={() => togglePopover('kat')}
          >
            <span className="block border-b border-rule pb-2.5 font-sans text-[11px] font-bold uppercase tracking-widest text-muted">
              Kategori — pilih beberapa
            </span>
            {categories.map((cat) => (
              <FilterOption
                key={cat.id}
                label={cat.name}
                selected={activeCategorySlugs.includes(cat.slug)}
                onClick={() => toggleCategory(cat.slug)}
              />
            ))}
            {activeCategorySlugs.length > 0 && (
              <button
                type="button"
                onClick={() => pushFilters({ categorySlugs: [] })}
                className="mt-3 border-2 border-ink px-3.5 py-2 font-sans text-[11px] font-bold uppercase tracking-widest"
              >
                Reset
              </button>
            )}
          </FilterTrigger>

          <FilterTrigger
            label="Tanggal"
            valueLabel={activeDateLabel ? '1' : undefined}
            active={Boolean(activeDateOption)}
            open={openPopover === 'tgl'}
            onToggle={() => togglePopover('tgl')}
          >
            <span className="block border-b border-rule pb-2.5 font-sans text-[11px] font-bold uppercase tracking-widest text-muted">
              Tanggal — pilih satu
            </span>
            {NEWS_DATE_OPTIONS.map((option) => (
              <FilterOption
                key={option.value}
                label={option.label}
                selected={draftDateOption === option.value}
                onClick={() => selectDate(option.value)}
              />
            ))}
            {draftDateOption === 'custom' && (
              <div className="mt-3 flex flex-col gap-2 border-t border-rule pt-3">
                <label className="flex flex-col gap-1 text-[12px]">
                  Dari
                  <input
                    type="date"
                    value={dateFromDraft}
                    onChange={(e) => setDateFromDraft(e.target.value)}
                    className="border border-ink bg-transparent px-2 py-1.5 text-[13px] outline-none"
                  />
                </label>
                <label className="flex flex-col gap-1 text-[12px]">
                  Sampai
                  <input
                    type="date"
                    value={dateToDraft}
                    onChange={(e) => setDateToDraft(e.target.value)}
                    className="border border-ink bg-transparent px-2 py-1.5 text-[13px] outline-none"
                  />
                </label>
                <button
                  type="button"
                  onClick={applyCustomRange}
                  disabled={!dateFromDraft || !dateToDraft}
                  className="border-2 border-ink px-3.5 py-2 font-sans text-[11px] font-bold uppercase tracking-widest disabled:opacity-50"
                >
                  Terapkan
                </button>
              </div>
            )}
            {draftDateOption && (
              <button
                type="button"
                onClick={resetDate}
                className="mt-3 border-2 border-ink px-3.5 py-2 font-sans text-[11px] font-bold uppercase tracking-widest"
              >
                Reset
              </button>
            )}
          </FilterTrigger>
        </div>

        <button
          type="button"
          className="inline-flex items-center gap-2 whitespace-nowrap border border-ink px-3.5 py-2 font-sans text-[11px] font-bold uppercase tracking-widest transition-colors duration-hover ease-hover hover:bg-ink hover:text-paper focus-visible:bg-ink focus-visible:text-paper"
        >
          Urutkan: Terbaru ⇅
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2.5 border-b border-rule py-3.5">
        {activeAnakUsaha.map((entry) => (
          <button
            key={entry.id}
            type="button"
            onClick={() => toggleAnakUsaha(entry.slug)}
            className="inline-flex items-center gap-2 bg-signal px-3 py-1.5 font-sans text-[11px] font-bold uppercase tracking-widest transition-colors duration-hover ease-hover hover:bg-ink hover:text-signal focus-visible:bg-ink focus-visible:text-signal"
          >
            Group Companies <span className="font-serif font-bold normal-case tracking-normal">{entry.name}</span> ×
          </button>
        ))}
        {activeCategories.map((cat) => (
          <button
            key={cat.id}
            type="button"
            onClick={() => toggleCategory(cat.slug)}
            className="inline-flex items-center gap-2 bg-signal px-3 py-1.5 font-sans text-[11px] font-bold uppercase tracking-widest transition-colors duration-hover ease-hover hover:bg-ink hover:text-signal focus-visible:bg-ink focus-visible:text-signal"
          >
            Kategori <span className="font-serif font-bold normal-case tracking-normal">{cat.name}</span> ×
          </button>
        ))}
        {activeDateLabel && (
          <button
            type="button"
            onClick={() => pushFilters({ dateOption: undefined, dateFrom: undefined, dateTo: undefined })}
            className="inline-flex items-center gap-2 bg-signal px-3 py-1.5 font-sans text-[11px] font-bold uppercase tracking-widest transition-colors duration-hover ease-hover hover:bg-ink hover:text-signal focus-visible:bg-ink focus-visible:text-signal"
          >
            Tanggal <span className="font-serif font-bold normal-case tracking-normal">{activeDateLabel}</span> ×
          </button>
        )}
        {hasFilters && (
          <button
            type="button"
            onClick={clearAllFilters}
            className="border-b-2 border-ink pb-0.5 font-sans text-[11px] font-bold uppercase tracking-widest"
          >
            Hapus semua
          </button>
        )}
        <span className="ml-auto font-sans text-[11px] font-bold uppercase tracking-widest text-muted">
          {searchFiltered.length} {searchFiltered.length === 1 ? 'story' : 'stories'}
        </span>
      </div>

      {loadingInitial && (
        <div className="py-[clamp(32px,5vw,64px)] font-sans text-[11px] font-bold uppercase tracking-widest text-muted">
          Loading…
        </div>
      )}

      {!loadingInitial && featured && <ArticleCard article={featured} featured />}

      {!loadingInitial && (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))]">
          {gridItems.map((article) => (
            <ArticleCard key={article.id} article={article} />
          ))}
        </div>
      )}

      {!loadingInitial && searchFiltered.length === 0 && (
        <div className="border-b border-ink py-[clamp(32px,5vw,64px)]">
          <div className="font-sans text-[11px] font-bold uppercase tracking-widest text-muted">
            Tidak ada hasil
          </div>
          <div className="my-3.5 max-w-[34ch] font-serif text-[clamp(24px,3vw,34px)] font-bold leading-[1.1] tracking-[-0.03em]">
            {hasFilters
              ? 'Filter ini belum punya cerita yang cocok dengan pencarianmu.'
              : 'Pencarianmu tidak menemukan cerita apa pun di halaman ini.'}
          </div>
          <button
            type="button"
            onClick={clearAllFilters}
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
