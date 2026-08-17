import { useEffect, useState, type FormEvent } from 'react';
import type { ReaderQueueRow, ReaderQueueStatusFilter } from '@siders/contracts';
import { ApiError } from '../lib/api.js';
import { moderationApi } from '../lib/moderationApi.js';
import { useAsyncAction } from '../hooks/useAsyncAction.js';

const PAGE_LIMIT = 20;

const MUTE_PRESETS = [
  { label: '24h', hours: 24 },
  { label: '7d', hours: 24 * 7 },
  { label: '30d', hours: 24 * 30 },
] as const;

const TAB_BUTTON = (active: boolean) =>
  `rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
    active
      ? 'bg-[var(--signal)] text-white'
      : 'text-[var(--muted)] hover:bg-[var(--ink)]/[0.05] hover:text-[var(--ink)]'
  }`;

const ACTION_BUTTON =
  'rounded-md border border-[var(--rule)] px-2.5 py-1 text-xs font-medium text-[var(--muted)] transition-colors hover:border-[var(--ink)]/30 hover:text-[var(--ink)] disabled:opacity-50';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'Asia/Jakarta',
  });
}

function isCurrentlyMuted(reader: ReaderQueueRow): boolean {
  return reader.mutedUntil !== null && new Date(reader.mutedUntil).getTime() > Date.now();
}

/**
 * The reader directory, filterable by status and searchable by name or email, with mute and ban
 * controls per row. Every action here is immediately reversible — unban restores comment
 * authoring, unmute clears the expiry — so each button acts directly rather than behind a confirm
 * step; the one exception the moderation surface makes for that is comment removal
 * (`CommentModerationPage.tsx`), where the immediate effect is on public-facing content.
 *
 * Ban is a comment-authoring suspension, not an account lockout: a banned reader keeps their
 * session, keeps reading and liking, and can still file a report — the only thing a ban stops is
 * new comments (design.md - Decision 7, `openspec/changes/add-community-moderation`;
 * specs/authorization/spec.md - "Reader-only authorization"). Mute offers three preset durations
 * rather than a free datetime field (specs/community-moderation/spec.md - "A reader can be muted
 * for a bounded period"; design.md - proposal, "Reader mute offers preset durations"). Neither
 * action touches a single row in `comments` — a banned or muted reader's past comments stay
 * visible until removed as their own explicit action (specs/community-moderation/spec.md - "A
 * banned reader's existing comments remain visible").
 */
export function ReaderModerationPage() {
  const [statusFilter, setStatusFilter] = useState<ReaderQueueStatusFilter>('all');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState<string | undefined>(undefined);
  const [readers, setReaders] = useState<ReaderQueueRow[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reasonDrafts, setReasonDrafts] = useState<Record<string, string>>({});

  const [moderateState, runModerate] = useAsyncAction(
    (id: string, input: Parameters<typeof moderationApi.moderateReader>[1]) => moderationApi.moderateReader(id, input),
  );

  function load() {
    setLoading(true);
    setLoadError(null);
    moderationApi
      .listReaders({ search, status: statusFilter, limit: PAGE_LIMIT, offset: 0 })
      .then((page) => {
        setReaders(page);
        setHasMore(page.length === PAGE_LIMIT);
      })
      .catch((err: unknown) => setLoadError(err instanceof ApiError ? err.message : 'Could not load'))
      .finally(() => setLoading(false));
  }

  useEffect(load, [search, statusFilter]);

  function handleSearchSubmit(e: FormEvent) {
    e.preventDefault();
    setSearch(searchInput.trim() || undefined);
  }

  async function handleLoadMore() {
    setLoadingMore(true);
    try {
      const page = await moderationApi.listReaders({ search, status: statusFilter, limit: PAGE_LIMIT, offset: readers.length });
      setReaders((prev) => [...prev, ...page]);
      setHasMore(page.length === PAGE_LIMIT);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : 'Could not load more');
    } finally {
      setLoadingMore(false);
    }
  }

  function reasonFor(id: string): string | undefined {
    return reasonDrafts[id]?.trim() || undefined;
  }

  async function applyAction(id: string, input: Parameters<typeof moderationApi.moderateReader>[1]) {
    try {
      const updated = await runModerate(id, { ...input, ...(reasonFor(id) ? { reason: reasonFor(id) } : {}) });
      setReaders((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
      // Cleared only on success, so a rejected action keeps the moderator's text — and so a
      // later, different action on this reader (e.g. muting after banning) cannot silently
      // inherit a reason typed for the first one.
      setReasonDrafts((prev) => ({ ...prev, [id]: '' }));
    } catch {
      /* surfaced via moderateState.errorMessage */
    }
  }

  return (
    <div className="siders-scope min-h-full bg-[var(--paper)] text-[var(--ink)]">
      <div className="mx-auto max-w-4xl p-6">
        <div className="mb-1">
          <p className="font-mono text-xs uppercase tracking-widest text-[var(--muted)]">Community</p>
          <h1 className="font-display text-3xl">Readers</h1>
        </div>
        <p className="mb-5 max-w-xl text-sm text-[var(--muted)]">
          Mute a reader to block new comments for a set duration; ban them to block new comments
          indefinitely. Both keep the reader signed in and able to read, like, and report — neither
          ends their session, and neither touches their past comments.
        </p>

        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div className="flex gap-1.5">
            {(['all', 'active', 'banned'] as const).map((status) => (
              <button key={status} type="button" onClick={() => setStatusFilter(status)} className={TAB_BUTTON(statusFilter === status)}>
                {status === 'all' ? 'All' : status === 'active' ? 'Active' : 'Banned'}
              </button>
            ))}
          </div>
          <form onSubmit={handleSearchSubmit} className="ml-auto flex gap-2">
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search by name or email"
              className="w-56 rounded-md border border-[var(--rule)] bg-transparent px-3 py-1.5 text-sm placeholder:text-[var(--muted)]/60 focus:border-[var(--signal)] focus:outline-none focus:ring-2 focus:ring-[var(--signal)]/20"
            />
            <button type="submit" className={ACTION_BUTTON}>
              Search
            </button>
          </form>
        </div>

        {moderateState.forbidden && (
          <p className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300">
            You don&apos;t have permission to moderate readers.
          </p>
        )}
        {moderateState.errorMessage && !moderateState.forbidden && (
          <p className="mb-4 text-sm text-red-600 dark:text-red-400">{moderateState.errorMessage}</p>
        )}
        {loadError && (
          <p className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300">
            {loadError}
          </p>
        )}
        {loading && <p className="font-mono text-sm text-[var(--muted)]">Loading…</p>}
        {!loading && readers.length === 0 && <p className="text-sm text-[var(--muted)]">No readers match.</p>}

        <ul className="rounded-lg border border-[var(--rule)]">
          {readers.map((reader, index) => {
            const muted = isCurrentlyMuted(reader);
            return (
              <li key={reader.id} className={index > 0 ? 'border-t border-[var(--rule)]' : ''}>
                <div className="space-y-2 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--ink)] text-xs font-bold text-[var(--paper)]">
                      {reader.name.charAt(0).toUpperCase()}
                    </span>
                    <span className="text-sm font-medium">{reader.name}</span>
                    <span className="font-mono text-xs text-[var(--muted)]">{reader.email}</span>
                    <span
                      className={`rounded-full px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide ${
                        reader.status === 'banned'
                          ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
                          : 'bg-[var(--ink)]/[0.06] text-[var(--muted)]'
                      }`}
                    >
                      {reader.status}
                    </span>
                    {muted && (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                        Muted until {formatDate(reader.mutedUntil as string)}
                      </span>
                    )}
                    <span className="ml-auto font-mono text-xs text-[var(--muted)]">{reader.commentCount} comments</span>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      value={reasonDrafts[reader.id] ?? ''}
                      onChange={(e) => setReasonDrafts((prev) => ({ ...prev, [reader.id]: e.target.value }))}
                      placeholder="Reason (optional)"
                      className="w-48 rounded-md border border-[var(--rule)] bg-transparent px-2.5 py-1 text-xs placeholder:text-[var(--muted)]/60 focus:border-[var(--signal)] focus:outline-none focus:ring-2 focus:ring-[var(--signal)]/20"
                    />

                    <button
                      type="button"
                      disabled={moderateState.loading}
                      onClick={() => void applyAction(reader.id, { status: reader.status === 'active' ? 'banned' : 'active' })}
                      className={ACTION_BUTTON}
                    >
                      {reader.status === 'active' ? 'Ban' : 'Unban'}
                    </button>

                    {muted ? (
                      <button
                        type="button"
                        disabled={moderateState.loading}
                        onClick={() => void applyAction(reader.id, { mutedUntil: null })}
                        className={ACTION_BUTTON}
                      >
                        Unmute
                      </button>
                    ) : (
                      MUTE_PRESETS.map((preset) => (
                        <button
                          key={preset.label}
                          type="button"
                          disabled={moderateState.loading}
                          onClick={() =>
                            void applyAction(reader.id, {
                              mutedUntil: new Date(Date.now() + preset.hours * 60 * 60 * 1000).toISOString(),
                            })
                          }
                          className={ACTION_BUTTON}
                        >
                          Mute {preset.label}
                        </button>
                      ))
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>

        {hasMore && (
          <div className="mt-4 flex justify-center">
            <button
              type="button"
              onClick={() => void handleLoadMore()}
              disabled={loadingMore}
              className="rounded-md border border-[var(--rule)] px-4 py-2 text-sm text-[var(--muted)] transition-colors hover:border-[var(--ink)]/30 hover:text-[var(--ink)] disabled:opacity-50"
            >
              {loadingMore ? 'Loading…' : 'Load more'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
