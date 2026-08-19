import { useEffect, useState } from 'react';
import type { ArticleAdminResponse, HomeCurationEntryResponse } from '@siders/contracts';
import { ApiError } from '../lib/api.js';
import { articlesApi } from '../lib/articlesApi.js';
import { curationApi } from '../lib/curationApi.js';
import { useAsyncAction } from '../hooks/useAsyncAction.js';
import { ARTICLE_STATUS_STYLES } from '../lib/articleStatusStyles.js';
import { Button } from '../components/ui/Button.js';

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

function IconGrip({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 12 20" fill="currentColor" className={className}>
      <circle cx="3" cy="4" r="1.3" />
      <circle cx="9" cy="4" r="1.3" />
      <circle cx="3" cy="10" r="1.3" />
      <circle cx="9" cy="10" r="1.3" />
      <circle cx="3" cy="16" r="1.3" />
      <circle cx="9" cy="16" r="1.3" />
    </svg>
  );
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
    <div className="siders-scope min-h-full bg-[var(--paper)] text-[var(--ink)]">
      <div className="mx-auto max-w-3xl p-6">
        <div className="mb-1">
          <p className="font-mono text-xs uppercase tracking-widest text-[var(--muted)]">
            {picked.length}/{MAX_ENTRIES} curated
          </p>
          <h1 className="font-display text-3xl">Home curation</h1>
        </div>
        <p className="mb-6 max-w-xl text-sm text-[var(--muted)]">
          Drag to reorder. The first article leads the homepage. Positions left empty are filled with the most
          recently published articles.
        </p>

        {saveState.forbidden && (
          <p className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300">
            You don&apos;t have permission to manage homepage curation.
          </p>
        )}
        {saveState.errorMessage && !saveState.forbidden && (
          <p className="mb-4 text-sm text-red-600 dark:text-red-400">{saveState.errorMessage}</p>
        )}
        {loadError && (
          <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300">
            {loadError}
          </p>
        )}
        {loading && <p className="font-mono text-sm text-[var(--muted)]">Loading…</p>}

        {!loading && (
          <>
            <ul className="mb-4 rounded-lg border border-[var(--rule)]">
              {picked.length === 0 && (
                <li className="px-4 py-6 text-center text-sm text-[var(--muted)]">
                  Nothing curated. The homepage will show a purely chronological feed.
                </li>
              )}
              {picked.map((item, index) => {
                const statusStyle = ARTICLE_STATUS_STYLES[item.status];
                return (
                  <li
                    key={item.id}
                    draggable
                    onDragStart={() => setDragIndex(index)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => handleDrop(index)}
                    className={`relative flex cursor-move items-center gap-3 px-3 py-2.5 transition-colors hover:bg-[var(--ink)]/[0.03] ${index > 0 ? 'border-t border-[var(--rule)]' : ''}`}
                  >
                    <span className={`absolute inset-y-2 left-0 w-1 rounded-full ${statusStyle.rule}`} aria-hidden="true" />
                    <IconGrip className="ml-2 h-4 w-4 shrink-0 text-[var(--muted)]/50" />
                    <span className="w-5 shrink-0 font-mono text-xs text-[var(--muted)]">{index + 1}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-[var(--ink)]">{item.title}</p>
                      <p className="truncate font-mono text-xs text-[var(--muted)]">{item.slug}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className={`rounded-full px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider ${statusStyle.chip}`}>
                        {item.status}
                      </span>
                      {item.isPubliclyVisible === false && (
                        <span className="rounded-full bg-amber-500/15 px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider text-amber-700 dark:text-amber-400">
                          Not yet live
                        </span>
                      )}
                      <Button type="button" variant="ghost" tone="danger" onClick={() => removeArticle(item.id)}>
                        Remove
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>

            <div className="mb-8 flex flex-wrap items-center gap-3">
              <Button type="button" variant="primary" onClick={handleSave} disabled={saveState.loading}>
                {saveState.loading ? 'Saving…' : 'Save order'}
              </Button>
              <Button type="button" variant="ghost" onClick={clearAll} disabled={picked.length === 0}>
                Clear all
              </Button>
              {picked.length >= MAX_ENTRIES && (
                <span className="font-mono text-xs text-[var(--muted)]">Maximum of {MAX_ENTRIES} curated articles reached</span>
              )}
            </div>

            <p className="mb-2 font-mono text-xs uppercase tracking-widest text-[var(--muted)]">Add an article</p>
            <ul className="rounded-lg border border-[var(--rule)]">
              {pickableCandidates.length === 0 && (
                <li className="px-4 py-6 text-center text-sm text-[var(--muted)]">No more articles to add.</li>
              )}
              {pickableCandidates.map((article, index) => (
                <li
                  key={article.id}
                  className={`flex items-center justify-between gap-3 px-3 py-2.5 ${index > 0 ? 'border-t border-[var(--rule)]' : ''}`}
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm text-[var(--ink)]">{article.title}</p>
                    <p className="truncate font-mono text-xs text-[var(--muted)]">{article.slug}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span
                      className={`rounded-full px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider ${ARTICLE_STATUS_STYLES[article.status].chip}`}
                    >
                      {article.status}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => addArticle(article)}
                      disabled={picked.length >= MAX_ENTRIES}
                    >
                      Add
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
