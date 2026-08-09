import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { ArticleAdminResponse, ArticleStatus } from '@siders/contracts';
import { articlesApi } from '../lib/articlesApi.js';
import { ApiError } from '../lib/api.js';

const STATUS_FILTERS: Array<{ label: string; value: ArticleStatus | undefined }> = [
  { label: 'All', value: undefined },
  { label: 'Draft', value: 'draft' },
  { label: 'Scheduled', value: 'scheduled' },
  { label: 'Published', value: 'published' },
];

/** Article list view with draft/scheduled/published filters (tasks.md 11.1). */
export function ArticleListPage() {
  const [status, setStatus] = useState<ArticleStatus | undefined>(undefined);
  const [articles, setArticles] = useState<ArticleAdminResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    articlesApi
      .list(status)
      .then(setArticles)
      .catch((err: unknown) => setError(err instanceof ApiError ? err.message : 'Could not load articles'))
      .finally(() => setLoading(false));
  }, [status]);

  return (
    <div className="mx-auto max-w-5xl p-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Articles</h1>
        <Link
          to="/articles/new"
          className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
        >
          New article
        </Link>
      </div>

      <div className="mb-4 flex gap-2">
        {STATUS_FILTERS.map((filter) => (
          <button
            key={filter.label}
            type="button"
            onClick={() => setStatus(filter.value)}
            className={`rounded-full px-3 py-1 text-sm ${
              status === filter.value
                ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900'
                : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300'
            }`}
          >
            {filter.label}
          </button>
        ))}
      </div>

      {error && <p className="text-red-600 dark:text-red-400">{error}</p>}
      {loading && <p className="text-gray-500 dark:text-gray-400">Loading…</p>}

      {!loading && !error && articles.length === 0 && (
        <p className="text-gray-500 dark:text-gray-400">No articles yet.</p>
      )}

      <ul className="divide-y divide-gray-200 dark:divide-gray-700">
        {articles.map((article) => (
          <li key={article.id}>
            <Link
              to={`/articles/${article.id}`}
              className="flex items-center justify-between py-3 hover:bg-gray-50 dark:hover:bg-gray-800"
            >
              <div>
                <p className="font-medium text-gray-900 dark:text-white">{article.title || 'Untitled'}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">{article.authorName}</p>
              </div>
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs capitalize text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                {article.status}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
