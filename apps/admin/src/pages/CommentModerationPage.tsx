import { useEffect, useState } from 'react';
import type { CommentQueueRow, CommentQueueStatusFilter } from '@siders/contracts';
import { ApiError } from '../lib/api.js';
import { moderationApi } from '../lib/moderationApi.js';
import { useAsyncAction } from '../hooks/useAsyncAction.js';

const POLL_INTERVAL_MS = 30_000;
const PAGE_LIMIT = 20;

const TAB_BUTTON = (active: boolean) =>
  `rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
    active
      ? 'bg-[var(--signal)] text-white'
      : 'text-[var(--muted)] hover:bg-[var(--ink)]/[0.05] hover:text-[var(--ink)]'
  }`;

const REASON_INPUT =
  'w-full rounded-md border border-[var(--rule)] bg-transparent px-3 py-1.5 text-sm placeholder:text-[var(--muted)]/60 focus:border-[var(--signal)] focus:outline-none focus:ring-2 focus:ring-[var(--signal)]/20';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'Asia/Jakarta',
  });
}

/**
 * The moderation queue: every reader comment, newest first, filterable by status, cursor-paginated
 * (specs/community-moderation/spec.md - "The queue is paginated by cursor, not offset" — there is
 * no page number here, only "load older"). A comment's body is rendered as a plain text child,
 * never `dangerouslySetInnerHTML` — `comments.body` is stored and served as plain text
 * (`packages/db/src/schema/engagement.ts`), and this screen shows exactly what was published
 * rather than starting to interpret markup that was never meant to render
 * (specs/community-moderation/spec.md - "Comment bodies are rendered as plain text in the
 * moderation queue").
 *
 * Polls every 30 seconds — `docs/ARCHITECTURE.md` §8.2 already calls this "a queue two people
 * look at", the same reasoning behind the 30-second moderation-queue poll it documents — plus a
 * manual refresh. A poll always reloads the first page under the current filter; a moderator who
 * has loaded further pages sees the queue reset to the top on the next tick, the same trade-off
 * an email inbox's auto-refresh makes.
 */
export function CommentModerationPage() {
  const [statusFilter, setStatusFilter] = useState<CommentQueueStatusFilter>('all');
  const [comments, setComments] = useState<CommentQueueRow[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<{ id: string; action: 'moderate' | 'dismiss' } | null>(null);
  const [reasonDraft, setReasonDraft] = useState('');

  const [moderateState, runModerate] = useAsyncAction(
    (id: string, input: Parameters<typeof moderationApi.moderateComment>[1]) => moderationApi.moderateComment(id, input),
  );
  const [dismissState, runDismiss] = useAsyncAction((id: string, reason: string | undefined) =>
    moderationApi.dismissCommentReports(id, reason ? { reason } : {}),
  );

  function loadFirstPage() {
    setLoading(true);
    setLoadError(null);
    moderationApi
      .listComments({ status: statusFilter, limit: PAGE_LIMIT })
      .then((page) => {
        setComments(page.items);
        setNextCursor(page.nextCursor);
      })
      .catch((err: unknown) => setLoadError(err instanceof ApiError ? err.message : 'Could not load'))
      .finally(() => setLoading(false));
  }

  useEffect(loadFirstPage, [statusFilter]);

  useEffect(() => {
    const id = setInterval(loadFirstPage, POLL_INTERVAL_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  async function handleLoadMore() {
    if (!nextCursor) return;
    setLoadingMore(true);
    try {
      const page = await moderationApi.listComments({ status: statusFilter, cursor: nextCursor, limit: PAGE_LIMIT });
      setComments((prev) => [...prev, ...page.items]);
      setNextCursor(page.nextCursor);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : 'Could not load more');
    } finally {
      setLoadingMore(false);
    }
  }

  function startAction(id: string, action: 'moderate' | 'dismiss') {
    setExpanded((current) => (current?.id === id && current.action === action ? null : { id, action }));
    setReasonDraft('');
  }

  async function confirmAction(comment: CommentQueueRow) {
    const nextStatus = comment.status === 'visible' ? 'removed' : 'visible';
    const reason = reasonDraft.trim();
    try {
      const updated = await runModerate(comment.id, reason ? { status: nextStatus, reason } : { status: nextStatus });
      setComments((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
      setExpanded(null);
      setReasonDraft('');
    } catch {
      /* surfaced via moderateState.errorMessage */
    }
  }

  /** Resolves every open report without changing the comment's status
   *  (specs/community-moderation/spec.md - "A permitted caller can dismiss a comment's open
   *  reports without removing it"). Reuses the same reason input the remove/restore action uses,
   *  since only one of the two is ever expanded on a row at a time. */
  async function confirmDismiss(comment: CommentQueueRow) {
    const reason = reasonDraft.trim();
    try {
      const updated = await runDismiss(comment.id, reason || undefined);
      // Under the Reported filter, a dismissed comment no longer matches it — drop the row
      // immediately rather than leaving it listed (badge and button gone) until the next poll.
      setComments((prev) =>
        statusFilter === 'reported'
          ? prev.filter((c) => c.id !== updated.id)
          : prev.map((c) => (c.id === updated.id ? updated : c)),
      );
      setExpanded(null);
      setReasonDraft('');
    } catch {
      /* surfaced via dismissState.errorMessage */
    }
  }

  return (
    <div className="siders-scope min-h-full bg-[var(--paper)] text-[var(--ink)]">
      <div className="mx-auto max-w-4xl p-6">
        <div className="mb-1 flex items-center justify-between gap-4">
          <div>
            <p className="font-mono text-xs uppercase tracking-widest text-[var(--muted)]">Community</p>
            <h1 className="font-display text-3xl">Comments</h1>
          </div>
          <button
            type="button"
            onClick={loadFirstPage}
            className="rounded-md border border-[var(--rule)] px-3 py-1.5 text-xs font-medium text-[var(--muted)] transition-colors hover:border-[var(--ink)]/30 hover:text-[var(--ink)]"
          >
            Refresh
          </button>
        </div>
        <p className="mb-5 max-w-xl text-sm text-[var(--muted)]">
          Every reader comment, newest first. Removing a comment hides it from the public article
          immediately; restoring returns it. Refreshes automatically every 30 seconds.
        </p>

        <div className="mb-4 flex gap-1.5">
          {(['all', 'reported', 'visible', 'removed'] as const).map((status) => (
            <button key={status} type="button" onClick={() => setStatusFilter(status)} className={TAB_BUTTON(statusFilter === status)}>
              {status === 'all' ? 'All' : status === 'reported' ? 'Reported' : status === 'visible' ? 'Visible' : 'Removed'}
            </button>
          ))}
        </div>

        {(moderateState.forbidden || dismissState.forbidden) && (
          <p className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300">
            You don&apos;t have permission to moderate comments.
          </p>
        )}
        {moderateState.errorMessage && !moderateState.forbidden && (
          <p className="mb-4 text-sm text-red-600 dark:text-red-400">{moderateState.errorMessage}</p>
        )}
        {dismissState.errorMessage && !dismissState.forbidden && (
          <p className="mb-4 text-sm text-red-600 dark:text-red-400">{dismissState.errorMessage}</p>
        )}

        {loadError && (
          <p className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300">
            {loadError}
          </p>
        )}
        {loading && <p className="font-mono text-sm text-[var(--muted)]">Loading…</p>}
        {!loading && comments.length === 0 && <p className="text-sm text-[var(--muted)]">No comments here.</p>}

        <ul className="rounded-lg border border-[var(--rule)]">
          {comments.map((comment, index) => (
            <li key={comment.id} className={index > 0 ? 'border-t border-[var(--rule)]' : ''}>
              <div className="space-y-1.5 p-4">
                <div className="flex flex-wrap items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-[var(--muted)]">
                  <span>{comment.authorName}</span>
                  <span>·</span>
                  <span className="truncate">{comment.articleTitle}</span>
                  <span>·</span>
                  <span>{formatDate(comment.createdAt)}</span>
                  {comment.status === 'removed' && (
                    <span className="rounded-full bg-red-100 px-2 py-0.5 text-red-700 dark:bg-red-900/30 dark:text-red-300">
                      Removed
                    </span>
                  )}
                  {/* Only rendered when the comment carries at least one open report — the count
                      and reasons themselves never act on anything
                      (specs/community-moderation/spec.md - "A comment's open report count and
                      reasons are never themselves an action"). */}
                  {comment.openReportCount !== undefined && (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                      {comment.openReportCount} report{comment.openReportCount === 1 ? '' : 's'}
                      {comment.reportReasons ? ` · ${comment.reportReasons.join(', ')}` : ''}
                    </span>
                  )}
                </div>
                {/* Plain text child, never dangerouslySetInnerHTML — a comment body has no rich-text
                    affordance and this screen shows exactly what was stored. */}
                <p className="whitespace-pre-wrap text-sm text-[var(--ink)]">{comment.body}</p>
                <div className="flex items-center gap-3 pt-1">
                  <button
                    type="button"
                    onClick={() => startAction(comment.id, 'moderate')}
                    className="font-mono text-xs uppercase tracking-wide text-[var(--muted)] hover:text-[var(--ink)]"
                  >
                    {comment.status === 'visible' ? 'Remove' : 'Restore'}
                  </button>
                  {comment.openReportCount !== undefined && (
                    <button
                      type="button"
                      onClick={() => startAction(comment.id, 'dismiss')}
                      className="font-mono text-xs uppercase tracking-wide text-[var(--muted)] hover:text-[var(--ink)]"
                    >
                      Dismiss reports
                    </button>
                  )}
                </div>
                {expanded?.id === comment.id && (
                  <div className="flex items-center gap-2 pt-1.5">
                    <input
                      value={reasonDraft}
                      onChange={(e) => setReasonDraft(e.target.value)}
                      placeholder="Reason (optional)"
                      className={REASON_INPUT}
                    />
                    {expanded.action === 'moderate' ? (
                      <button
                        type="button"
                        onClick={() => void confirmAction(comment)}
                        disabled={moderateState.loading}
                        className="shrink-0 rounded-md bg-[var(--signal)] px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-[var(--signal-hover)] disabled:opacity-50"
                      >
                        {comment.status === 'visible' ? 'Confirm remove' : 'Confirm restore'}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => void confirmDismiss(comment)}
                        disabled={dismissState.loading}
                        className="shrink-0 rounded-md bg-[var(--signal)] px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-[var(--signal-hover)] disabled:opacity-50"
                      >
                        Confirm dismiss
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setExpanded(null)}
                      className="shrink-0 font-mono text-xs uppercase tracking-wide text-[var(--muted)] hover:text-[var(--ink)]"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>

        {nextCursor && (
          <div className="mt-4 flex justify-center">
            <button
              type="button"
              onClick={() => void handleLoadMore()}
              disabled={loadingMore}
              className="rounded-md border border-[var(--rule)] px-4 py-2 text-sm text-[var(--muted)] transition-colors hover:border-[var(--ink)]/30 hover:text-[var(--ink)] disabled:opacity-50"
            >
              {loadingMore ? 'Loading…' : 'Load older'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
