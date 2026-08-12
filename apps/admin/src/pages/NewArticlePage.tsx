import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { articlesApi } from '../lib/articlesApi.js';
import { ApiError } from '../lib/api.js';

/**
 * Creates a fresh draft immediately on mount and redirects into its edit view, so
 * `ArticleEditPage` only ever deals with an article that already exists — autosave, slug
 * display, and every action button assume a persisted id
 * (specs/article-management/spec.md - "New article starts as draft").
 */
export function NewArticlePage() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    // The title alone can't seed the slug here: slugs freeze after first save and are never
    // auto-suffixed on collision (design.md - "it does not auto-append -2, -3 variants"), so a
    // shared literal title like "Untitled" would make every "New article" click after the first
    // one fail with a slug conflict, forever, until that first draft's slug was manually
    // changed. A random suffix makes the placeholder slug collision-proof; the title stays
    // editable and human-friendly.
    articlesApi
      .create({ title: 'Untitled', slug: `untitled-${crypto.randomUUID().slice(0, 8)}` })
      .then((article) => navigate(`/articles/${article.id}`, { replace: true }))
      .catch((err: unknown) => {
        setError(err instanceof ApiError ? err.message : 'Could not create a new article');
      });
  }, [navigate]);

  if (error) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-center">
        <div>
          <p className="text-red-600 dark:text-red-400">{error}</p>
          <button
            type="button"
            className="mt-4 rounded-md border border-gray-300 px-3 py-1.5 text-sm dark:border-gray-600"
            onClick={() => navigate('/articles')}
          >
            Back to articles
          </button>
        </div>
      </div>
    );
  }

  return <div className="p-8 text-center text-gray-500 dark:text-gray-400">Creating draft…</div>;
}
