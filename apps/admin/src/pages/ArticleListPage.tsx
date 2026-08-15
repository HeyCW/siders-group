import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { ArticleAdminResponse, ArticleStatus } from '@siders/contracts';
import { articlesApi } from '../lib/articlesApi.js';
import { ApiError } from '../lib/api.js';
import { ARTICLE_STATUS_STYLES } from '../lib/articleStatusStyles.js';
import { formatRelativeTime } from '../lib/formatRelativeTime.js';

const STATUS_FILTERS: Array<{ label: string; value: ArticleStatus | undefined }> = [
  { label: 'All', value: undefined },
  { label: 'Draft', value: 'draft' },
  { label: 'Scheduled', value: 'scheduled' },
  { label: 'Published', value: 'published' },
];

const MAX_STAGGERED_ROWS = 8;
const STAGGER_STEP_MS = 40;

function IconArticlePlaceholder({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M5 3h7l3 3v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" />
      <path d="M12 3v3h3" />
      <path d="M7 8h3M7 11h6M7 14h6" />
    </svg>
  );
}

/** Article list view: a docket of every article, filterable by status and searchable by title
 *  or byline — fetched once (unfiltered) and sliced client-side, since the whole set is small
 *  enough that instant filtering beats a round trip per click (tasks.md 11.1). */
export function ArticleListPage() {
  const [status, setStatus] = useState<ArticleStatus | undefined>(undefined);
  const [search, setSearch] = useState('');
  const [articles, setArticles] = useState<ArticleAdminResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    articlesApi
      .list()
      .then(setArticles)
      .catch((err: unknown) => setError(err instanceof ApiError ? err.message : 'Could not load articles'))
      .finally(() => setLoading(false));
  }, []);

  const counts = useMemo(
    () => ({
      all: articles.length,
      draft: articles.filter((a) => a.status === 'draft').length,
      scheduled: articles.filter((a) => a.status === 'scheduled').length,
      published: articles.filter((a) => a.status === 'published').length,
    }),
    [articles],
  );

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    return articles.filter((article) => {
      if (status && article.status !== status) return false;
      if (!query) return true;
      return article.title.toLowerCase().includes(query) || article.authorName.toLowerCase().includes(query);
    });
  }, [articles, status, search]);

  return (
    <div className="siders-scope min-h-full bg-[var(--paper)] text-[var(--ink)]">
      <div className="mx-auto max-w-4xl p-6">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="font-mono text-xs uppercase tracking-widest text-[var(--muted)]">{counts.all} in the queue</p>
            <h1 className="font-display text-3xl">Articles</h1>
          </div>
          <Link
            to="/articles/new"
            className="rounded-md bg-[var(--signal)] px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--signal-hover)]"
          >
            New article
          </Link>
        </div>

        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            {STATUS_FILTERS.map((filter) => {
              const count = filter.value ? counts[filter.value] : counts.all;
              const active = status === filter.value;
              return (
                <button
                  key={filter.label}
                  type="button"
                  onClick={() => setStatus(filter.value)}
                  className={`rounded-full px-3 py-1.5 font-mono text-xs uppercase tracking-wide transition-colors ${
                    active
                      ? 'bg-[var(--ink)] text-[var(--paper)]'
                      : 'bg-[var(--ink)]/[0.06] text-[var(--muted)] hover:bg-[var(--ink)]/10'
                  }`}
                >
                  {filter.label} <span className="opacity-60">{count}</span>
                </button>
              );
            })}
          </div>

          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search title or byline…"
            className="w-full max-w-[220px] rounded-md border border-[var(--rule)] bg-transparent px-3 py-1.5 text-sm placeholder:text-[var(--muted)] focus:border-[var(--signal)] focus:outline-none focus:ring-2 focus:ring-[var(--signal)]/20"
          />
        </div>

        {error && (
          <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300">
            {error}
          </p>
        )}

        {loading && <p className="font-mono text-sm text-[var(--muted)]">Loading…</p>}

        {!loading && !error && articles.length === 0 && (
          <p className="text-sm text-[var(--muted)]">No articles yet. Write the first one.</p>
        )}

        {!loading && !error && articles.length > 0 && visible.length === 0 && (
          <p className="text-sm text-[var(--muted)]">Nothing matches that search.</p>
        )}

        <ul className="space-y-1">
          {visible.map((article, index) => {
            const statusStyle = ARTICLE_STATUS_STYLES[article.status];
            return (
              <li
                key={article.id}
                className="relative motion-safe:animate-[fadeInUp_0.4s_ease_forwards] motion-safe:opacity-0"
                style={{ animationDelay: `${Math.min(index, MAX_STAGGERED_ROWS) * STAGGER_STEP_MS}ms` }}
              >
                <span className={`absolute inset-y-2 left-0 w-1 rounded-full ${statusStyle.rule}`} aria-hidden="true" />
                <Link
                  to={`/articles/${article.id}`}
                  className="flex items-center gap-4 rounded-lg py-3 pl-5 pr-3 transition-colors hover:bg-[var(--ink)]/[0.03]"
                >
                  <div className="h-14 w-14 shrink-0 overflow-hidden rounded-md bg-[var(--rule)]/50">
                    {article.featuredImageUrl ? (
                      <img src={article.featuredImageUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-[var(--muted)]">
                        <IconArticlePlaceholder className="h-5 w-5" />
                      </div>
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="truncate font-display text-lg">{article.title || 'Untitled'}</p>
                    <p className="mt-0.5 truncate font-mono text-xs text-[var(--muted)]">
                      {article.authorName} · updated {formatRelativeTime(article.updatedAt)}
                      {article.categories.length > 0 && ` · ${article.categories.map((c) => c.name).join(', ')}`}
                    </p>
                  </div>

                  <span
                    className={`shrink-0 rounded-full px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider ${statusStyle.chip}`}
                  >
                    {article.status}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
