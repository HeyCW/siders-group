import { useEffect, useState } from 'react';
import type { ReelResponse, ReelsCurationEntryResponse } from '@siders/contracts';
import { ApiError } from '../lib/api.js';
import { reelsApi, reelsCurationApi } from '../lib/reelsApi.js';
import { useAsyncAction } from '../hooks/useAsyncAction.js';

const MAX_ENTRIES = 10;

interface PickedItem {
  id: string;
  provider: string;
  externalId: string;
  posterUrl: string;
  caption: string | null;
  status: ReelResponse['status'];
  /** Known from the server for every entry loaded from `GET /admin/reels-curation`. An item
   *  just added from the library (not yet saved) has no server answer yet, so this is left
   *  `undefined` and the badge is simply omitted rather than guessed — mirrors
   *  `HomeCurationPage`'s own `isPubliclyVisible?` handling. */
  isPubliclyVisible?: boolean;
}

function toPickedItem(entry: ReelsCurationEntryResponse): PickedItem {
  return {
    id: entry.reel.id,
    provider: entry.reel.provider,
    externalId: entry.reel.externalId,
    posterUrl: entry.reel.posterUrl,
    caption: entry.reel.caption,
    status: entry.status,
    isPubliclyVisible: entry.isPubliclyVisible,
  };
}

/**
 * The reels rail ordering screen: one ordered list, saved as a whole
 * (specs/reels-curation/spec.md - "The ordering is replaced as a whole list"). There is no
 * per-item save — dragging, adding, and removing all happen in local state, and a single `PUT`
 * submits the resulting order. Unlike the homepage curation screen, an empty rail here does not
 * fall back to anything — the public rail simply shows nothing
 * (specs/reels-curation/spec.md - "The rail is not backfilled").
 */
export function ReelsCurationPage() {
  const [picked, setPicked] = useState<PickedItem[]>([]);
  const [library, setLibrary] = useState<ReelResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const [saveState, runSave] = useAsyncAction((reelIds: string[]) => reelsCurationApi.replace(reelIds));

  function load() {
    setLoading(true);
    Promise.all([reelsCurationApi.list(), reelsApi.list()])
      .then(([entries, reels]) => {
        setPicked(entries.map(toPickedItem));
        setLibrary(reels);
      })
      .catch((err: unknown) => setLoadError(err instanceof ApiError ? err.message : 'Could not load'))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  const pickedIds = new Set(picked.map((item) => item.id));
  const pickableReels = library.filter((reel) => !pickedIds.has(reel.id));

  function addReel(reel: ReelResponse) {
    if (picked.length >= MAX_ENTRIES) return;
    setPicked((prev) => [
      ...prev,
      { id: reel.id, provider: reel.provider, externalId: reel.externalId, posterUrl: reel.posterUrl, caption: reel.caption, status: reel.status },
    ]);
  }

  function removeReel(id: string) {
    setPicked((prev) => prev.filter((item) => item.id !== id));
  }

  function clearAll() {
    if (picked.length === 0) return;
    if (!window.confirm('Clear the entire reels rail? The homepage will show no reels rail at all.')) return;
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
      <h1 className="mb-1 text-2xl font-bold text-gray-900 dark:text-white">Reels Rail</h1>
      <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
        Drag to reorder. Unlike homepage curation, an empty rail is not filled automatically — it simply shows
        nothing.
      </p>

      {saveState.forbidden && (
        <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-300">
          You don&apos;t have permission to manage the reels rail.
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
                Nothing on the rail. The homepage will show no reels rail.
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
                  <img src={item.posterUrl} alt="" className="h-10 w-10 shrink-0 rounded-md object-cover" />
                  <div className="min-w-0">
                    <p className="truncate text-sm text-gray-900 dark:text-white">
                      {item.provider} · {item.externalId}
                    </p>
                    {item.caption && <p className="truncate text-xs text-gray-400">{item.caption}</p>}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs capitalize text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                    {item.status}
                  </span>
                  {item.isPubliclyVisible === false && (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                      not live
                    </span>
                  )}
                  <button type="button" onClick={() => removeReel(item.id)} className="text-xs text-red-600 dark:text-red-400">
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
              <span className="text-xs text-gray-400">Maximum of {MAX_ENTRIES} reels reached</span>
            )}
          </div>

          <h2 className="mb-2 text-sm font-semibold text-gray-700 dark:text-gray-200">Add a reel</h2>
          <ul className="divide-y divide-gray-200 rounded-md border border-gray-200 dark:divide-gray-700 dark:border-gray-700">
            {pickableReels.length === 0 && (
              <li className="px-3 py-4 text-sm text-gray-500 dark:text-gray-400">No more reels to add.</li>
            )}
            {pickableReels.map((reel) => (
              <li key={reel.id} className="flex items-center justify-between gap-3 px-3 py-2">
                <div className="flex min-w-0 items-center gap-3">
                  <img src={reel.posterUrl} alt="" className="h-10 w-10 shrink-0 rounded-md object-cover" />
                  <div className="min-w-0">
                    <p className="truncate text-sm text-gray-900 dark:text-white">
                      {reel.provider} · {reel.externalId}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs capitalize text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                    {reel.status}
                  </span>
                  <button
                    type="button"
                    onClick={() => addReel(reel)}
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
