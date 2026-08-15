import { useEffect, useState } from 'react';
import type { ReelProvider, ReelResponse, ReelsCurationEntryResponse } from '@siders/contracts';
import { MAX_REELS_CURATION_ENTRIES } from '@siders/contracts';
import { ApiError } from '../lib/api.js';
import { reelsApi, reelsCurationApi } from '../lib/reelsApi.js';
import { useAsyncAction } from '../hooks/useAsyncAction.js';
import { REEL_STATUS_STYLES } from '../lib/reelStatusStyles.js';

interface PickedItem {
  id: string;
  provider: ReelProvider;
  externalId: string;
  posterUrl: string;
  caption: string | null;
  status: ReelResponse['status'];
  /** Authoritative for every entry loaded from `GET /admin/reels-curation`. For an item just
   *  added from the library (not yet saved), `addReel` derives it from the reel's own `status`
   *  — unlike `HomeCurationPage`'s equivalent field, a reel's status is already known client-side
   *  at add time, so there's no need to leave this `undefined` and omit the badge until save. */
  isPubliclyVisible: boolean;
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
    if (picked.length >= MAX_REELS_CURATION_ENTRIES) return;
    setPicked((prev) => [
      ...prev,
      {
        id: reel.id,
        provider: reel.provider,
        externalId: reel.externalId,
        posterUrl: reel.posterUrl,
        caption: reel.caption,
        status: reel.status,
        isPubliclyVisible: reel.status === 'published',
      },
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
    <div className="siders-scope min-h-full bg-[var(--paper)] text-[var(--ink)]">
      <div className="mx-auto max-w-3xl p-6">
        <div className="mb-1">
          <p className="font-mono text-xs uppercase tracking-widest text-[var(--muted)]">
            {picked.length}/{MAX_REELS_CURATION_ENTRIES} on the rail
          </p>
          <h1 className="font-display text-3xl">Reels rail</h1>
        </div>
        <p className="mb-6 max-w-xl text-sm text-[var(--muted)]">
          Drag to reorder. Unlike homepage curation, an empty rail is not filled automatically — it simply shows
          nothing.
        </p>

        {saveState.forbidden && (
          <p className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300">
            You don&apos;t have permission to manage the reels rail.
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
                  Nothing on the rail. The homepage will show no reels rail.
                </li>
              )}
              {picked.map((item, index) => {
                const statusStyle = REEL_STATUS_STYLES[item.status];
                return (
                  <li
                    key={item.id}
                    draggable
                    onDragStart={() => setDragIndex(index)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => handleDrop(index)}
                    className={`relative flex cursor-move items-center gap-3 px-3 py-2 transition-colors hover:bg-[var(--ink)]/[0.03] ${index > 0 ? 'border-t border-[var(--rule)]' : ''}`}
                  >
                    <span className={`absolute inset-y-2 left-0 w-1 rounded-full ${statusStyle.rule}`} aria-hidden="true" />
                    <IconGrip className="ml-2 h-4 w-4 shrink-0 text-[var(--muted)]/50" />
                    <span className="w-5 shrink-0 font-mono text-xs text-[var(--muted)]">{index + 1}</span>
                    <img src={item.posterUrl} alt="" className="h-12 w-12 shrink-0 rounded-md object-cover" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm capitalize text-[var(--ink)]">
                        {item.provider} · {item.externalId}
                      </p>
                      {item.caption && <p className="truncate font-mono text-xs text-[var(--muted)]">{item.caption}</p>}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className={`rounded-full px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider ${statusStyle.chip}`}>
                        {item.status}
                      </span>
                      {!item.isPubliclyVisible && (
                        <span className="rounded-full bg-amber-500/15 px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider text-amber-700 dark:text-amber-400">
                          Not live
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => removeReel(item.id)}
                        className="font-mono text-xs uppercase tracking-wide text-[var(--muted)] hover:text-red-600 dark:hover:text-red-400"
                      >
                        Remove
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>

            <div className="mb-8 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={handleSave}
                disabled={saveState.loading}
                className="rounded-md bg-[var(--signal)] px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--signal-hover)] disabled:opacity-50"
              >
                {saveState.loading ? 'Saving…' : 'Save order'}
              </button>
              <button
                type="button"
                onClick={clearAll}
                disabled={picked.length === 0}
                className="font-mono text-xs uppercase tracking-wide text-[var(--muted)] hover:text-[var(--ink)] disabled:opacity-40"
              >
                Clear all
              </button>
              {picked.length >= MAX_REELS_CURATION_ENTRIES && (
                <span className="font-mono text-xs text-[var(--muted)]">Maximum of {MAX_REELS_CURATION_ENTRIES} reels reached</span>
              )}
            </div>

            <p className="mb-2 font-mono text-xs uppercase tracking-widest text-[var(--muted)]">Add a reel</p>
            <ul className="rounded-lg border border-[var(--rule)]">
              {pickableReels.length === 0 && (
                <li className="px-4 py-6 text-center text-sm text-[var(--muted)]">No more reels to add.</li>
              )}
              {pickableReels.map((reel, index) => (
                <li
                  key={reel.id}
                  className={`flex items-center justify-between gap-3 px-3 py-2 ${index > 0 ? 'border-t border-[var(--rule)]' : ''}`}
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <img src={reel.posterUrl} alt="" className="h-12 w-12 shrink-0 rounded-md object-cover" />
                    <p className="truncate text-sm capitalize text-[var(--ink)]">
                      {reel.provider} · {reel.externalId}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span
                      className={`rounded-full px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider ${REEL_STATUS_STYLES[reel.status].chip}`}
                    >
                      {reel.status}
                    </span>
                    <button
                      type="button"
                      onClick={() => addReel(reel)}
                      disabled={picked.length >= MAX_REELS_CURATION_ENTRIES}
                      className="font-mono text-xs uppercase tracking-wide text-[var(--signal)] hover:text-[var(--signal-hover)] disabled:opacity-40"
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
    </div>
  );
}
