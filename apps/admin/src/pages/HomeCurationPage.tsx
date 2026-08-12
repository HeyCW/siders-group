import { useEffect, useState } from 'react';
import type { ArticleAdminResponse, HomeCurationEntryResponse } from '@siders/contracts';
import { ApiError } from '../lib/api.js';
import { articlesApi } from '../lib/articlesApi.js';
import { curationApi } from '../lib/curationApi.js';
import { useAsyncAction } from '../hooks/useAsyncAction.js';

const MAX_ENTRIES = 10;

interface PickedItem {
  id: string;
  title: string;
  slug: string;
  status: ArticleAdminResponse['status'];
  /**
   * Known from the server for every entry loaded from `GET /admin/curation`. An item just added
   * from the picker (not yet saved) has no server answer yet, so this is left `undefined` and
   * the badge is simply omitted rather than guessed — a `scheduled` article due before the next
   * save would otherwise show an incorrect not-live badge.
   */
  isPubliclyVisible?: boolean;
}

function toPickedItem(entry: HomeCurationEntryResponse): PickedItem {
  return { id: entry.article.id, title: entry.article.title, slug: entry.article.slug, status: entry.status, isPubliclyVisible: entry.isPubliclyVisible };
}

/**
 * The homepage curation screen: one ordered list, saved as a whole (specs/home-curation/spec.md
 * - "Curation is replaced as a whole list"). There is no per-item save — dragging, adding, and
 * removing all happen in local state, and a single `PUT` submits the resulting order
 * (tasks.md - 5.3, 5.5).
 */
export function HomeCurationPage() {
  const [picked, setPicked] = useState<PickedItem[]>([]);
  const [candidates, setCandidates] = useState<ArticleAdminResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const [saveState, runSave] = useAsyncAction((articleIds: string[]) => curationApi.replace(articleIds));

  function load() {
    setLoading(true);
    Promise.all([curationApi.list(), articlesApi.list()])
      .then(([entries, articles]) => {
        setPicked(entries.map(toPickedItem));
        setCandidates(articles);
      })
      .catch((err: unknown) => setLoadError(err instanceof ApiError ? err.message : 'Could not load'))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  const pickedIds = new Set(picked.map((item) => item.id));
  const pickableCandidates = candidates.filter((article) => !pickedIds.has(article.id));

  function addArticle(article: ArticleAdminResponse) {
    if (picked.length >= MAX_ENTRIES) return;
    setPicked((prev) => [...prev, { id: article.id, title: article.title, slug: article.slug, status: article.status }]);
  }

  function removeArticle(id: string) {
    setPicked((prev) => prev.filter((item) => item.id !== id));
  }

  function clearAll() {
    if (picked.length === 0) return;
    if (!window.confirm('Clear the entire curated list? The homepage will fall back to a purely chronological feed.')) return;
    setPicked([]);
  }

  function handleDrop(targetIndex: number) {
    setPicked((prev) => {
      if (dragIndex === null || dragIndex === targetIndex) return prev;
      const next = [...prev];
      const [moved] = next.splice(dragIndex, 1);
      if (!moved) return prev;
      next.splice(targetIndex, 0, moved);
      return next;
    });
    setDragIndex(null);
  }

  async function handleSave() {
    try {
      const entries = await runSave(picked.map((item) => item.id));
      setPicked(entries.map(toPickedItem));
    } catch {
      /* surfaced via saveState.errorMessage */
    }
  }

  return (
    <div className="mx-auto max-w-3xl p-6">
      <h1 className="mb-1 text-2xl font-bold text-gray-900 dark:text-white">Homepage Curation</h1>
      <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
        Drag to reorder. The first article leads the homepage. Positions left empty are filled with the most
        recently published articles.
      </p>

      {saveState.forbidden && (
        <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-300">
          You don&apos;t have permission to manage homepage curation.
        </p>
      )}
      {saveState.errorMessage && !saveState.forbidden && (
        <p className="mb-4 text-sm text-red-600 dark:text-red-400">{saveState.errorMessage}</p>
      )}
      {loadError && <p className="text-red-600 dark:text-red-400">{loadError}</p>}
      {loading && <p className="text-gray-500 dark:text-gray-400">Loading…</p>}

      {!loading && (
        <>
          <ul className="mb-4 divide-y divide-gray-200 rounded-md border border-gray-200 dark:divide-gray-700 dark:border-gray-700">
            {picked.length === 0 && (
              <li className="px-3 py-4 text-sm text-gray-500 dark:text-gray-400">
                Nothing curated. The homepage will show a purely chronological feed.
              </li>
            )}
            {picked.map((item, index) => (
              <li
                key={item.id}
                draggable
                onDragStart={() => setDragIndex(index)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => handleDrop(index)}
                className="flex cursor-move items-center justify-between gap-3 px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-800"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className="text-xs text-gray-400">{index + 1}</span>
                  <div className="min-w-0">
                    <p className="truncate text-sm text-gray-900 dark:text-white">{item.title}</p>
                    <p className="truncate text-xs text-gray-400">{item.slug}</p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs capitalize text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                    {item.status}
                  </span>
                  {item.isPubliclyVisible === false && (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                      not yet live
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => removeArticle(item.id)}
                    className="text-xs text-red-600 dark:text-red-400"
                  >
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ul>

          <div className="mb-6 flex items-center gap-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={saveState.loading}
              className="rounded-md bg-blue-600 px-3 py-1.5 text-sm text-white disabled:opacity-50"
            >
              {saveState.loading ? 'Saving…' : 'Save'}
            </button>
            <button
              type="button"
              onClick={clearAll}
              disabled={picked.length === 0}
              className="rounded-md px-3 py-1.5 text-sm text-gray-600 disabled:opacity-50 dark:text-gray-300"
            >
              Clear all
            </button>
            {picked.length >= MAX_ENTRIES && (
              <span className="text-xs text-gray-400">Maximum of {MAX_ENTRIES} curated articles reached</span>
            )}
          </div>

          <h2 className="mb-2 text-sm font-semibold text-gray-700 dark:text-gray-200">Add an article</h2>
          <ul className="divide-y divide-gray-200 rounded-md border border-gray-200 dark:divide-gray-700 dark:border-gray-700">
            {pickableCandidates.length === 0 && (
              <li className="px-3 py-4 text-sm text-gray-500 dark:text-gray-400">No more articles to add.</li>
            )}
            {pickableCandidates.map((article) => (
              <li key={article.id} className="flex items-center justify-between gap-3 px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm text-gray-900 dark:text-white">{article.title}</p>
                  <p className="truncate text-xs text-gray-400">{article.slug}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs capitalize text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                    {article.status}
                  </span>
                  <button
                    type="button"
                    onClick={() => addArticle(article)}
                    disabled={picked.length >= MAX_ENTRIES}
                    className="text-xs text-blue-600 disabled:opacity-50 dark:text-blue-400"
                  >
                    Add
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
