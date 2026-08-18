import { useEffect, useState } from 'react';
import type { ContactMessageRow, ContactMessageStatusFilter } from '@siders/contracts';
import { ApiError } from '../lib/api.js';
import { contactApi } from '../lib/contactApi.js';
import { useAsyncAction } from '../hooks/useAsyncAction.js';

const POLL_INTERVAL_MS = 30_000;

const TAB_BUTTON = (active: boolean) =>
  `rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
    active
      ? 'bg-[var(--signal)] text-white'
      : 'text-[var(--muted)] hover:bg-[var(--ink)]/[0.05] hover:text-[var(--ink)]'
  }`;

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
 * The contact-message inbox: every public submission, newest first, filterable by read state
 * (specs/contact-messages/spec.md - "The inbox lists messages filterable by read status, newest
 * first"). A message body is rendered as a plain text child, never `dangerouslySetInnerHTML` —
 * it originates from an unauthenticated, untrusted submitter
 * (specs/contact-messages/spec.md - "A message body is rendered as plain text in the admin
 * inbox"). No reply affordance: a sender's email is shown for reference only
 * (specs/contact-messages/spec.md - "The admin panel is not itself the reply channel") — staff
 * reply manually from their own email client.
 *
 * Polls every 30 seconds, matching `CommentModerationPage`'s own poll and the same
 * `docs/ARCHITECTURE.md` §8.2 reasoning. Unpaginated, unlike the comment queue — there is no
 * cursor here, so a poll simply reloads the current filter's full list.
 */
export function ContactMessagesPage() {
  const [statusFilter, setStatusFilter] = useState<ContactMessageStatusFilter>('all');
  const [messages, setMessages] = useState<ContactMessageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [toggleState, runToggle] = useAsyncAction((id: string, status: 'new' | 'read') =>
    contactApi.setStatus(id, { status }),
  );
  // Bumped by the Refresh button to force an immediate reload through the same guarded path as
  // the poll below, rather than a second, unguarded fetch.
  const [reloadToken, setReloadToken] = useState(0);

  // One effect owns both the initial/filter-change load and the 30s poll, with a single
  // `cancelled` flag — mirroring Sidebar.tsx's own poll guard. Switching `statusFilter` (or
  // bumping `reloadToken`) tears down this effect first, which sets `cancelled` before the new
  // one starts, so a slower, earlier response can never overwrite a newer one or fire after
  // unmount. `showLoading` is false for background poll ticks, so the list doesn't flash back to
  // "Loading…" every 30 seconds when nothing changed.
  useEffect(() => {
    let cancelled = false;

    function load(showLoading: boolean) {
      if (showLoading) setLoading(true);
      setLoadError(null);
      contactApi
        .list({ status: statusFilter })
        .then((rows) => {
          if (!cancelled) setMessages(rows);
        })
        .catch((err: unknown) => {
          if (!cancelled) setLoadError(err instanceof ApiError ? err.message : 'Could not load');
        })
        .finally(() => {
          if (!cancelled && showLoading) setLoading(false);
        });
    }

    load(true);
    const id = setInterval(() => load(false), POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [statusFilter, reloadToken]);

  async function toggleStatus(message: ContactMessageRow) {
    const nextStatus = message.status === 'new' ? 'read' : 'new';
    try {
      const updated = await runToggle(message.id, nextStatus);
      setMessages((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
    } catch {
      /* surfaced via toggleState.errorMessage */
    }
  }

  return (
    <div className="siders-scope min-h-full bg-[var(--paper)] text-[var(--ink)]">
      <div className="mx-auto max-w-4xl p-6">
        <div className="mb-1 flex items-center justify-between gap-4">
          <div>
            <p className="font-mono text-xs uppercase tracking-widest text-[var(--muted)]">Site</p>
            <h1 className="font-display text-3xl">Messages</h1>
          </div>
          <button
            type="button"
            onClick={() => setReloadToken((t) => t + 1)}
            className="rounded-md border border-[var(--rule)] px-3 py-1.5 text-xs font-medium text-[var(--muted)] transition-colors hover:border-[var(--ink)]/30 hover:text-[var(--ink)]"
          >
            Refresh
          </button>
        </div>
        <p className="mb-5 max-w-xl text-sm text-[var(--muted)]">
          Every contact-form submission, newest first. There is no reply from here — use the sender&apos;s
          email address directly. Refreshes automatically every 30 seconds.
        </p>

        <div className="mb-4 flex gap-1.5">
          {(['all', 'new', 'read'] as const).map((status) => (
            <button key={status} type="button" onClick={() => setStatusFilter(status)} className={TAB_BUTTON(statusFilter === status)}>
              {status === 'all' ? 'All' : status === 'new' ? 'Unread' : 'Read'}
            </button>
          ))}
        </div>

        {toggleState.forbidden && (
          <p className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300">
            You don&apos;t have permission to manage contact messages.
          </p>
        )}
        {toggleState.errorMessage && !toggleState.forbidden && (
          <p className="mb-4 text-sm text-red-600 dark:text-red-400">{toggleState.errorMessage}</p>
        )}

        {loadError && (
          <p className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300">
            {loadError}
          </p>
        )}
        {loading && <p className="font-mono text-sm text-[var(--muted)]">Loading…</p>}
        {!loading && messages.length === 0 && <p className="text-sm text-[var(--muted)]">No messages here.</p>}

        <ul className="rounded-lg border border-[var(--rule)]">
          {messages.map((message, index) => (
            <li key={message.id} className={index > 0 ? 'border-t border-[var(--rule)]' : ''}>
              <div className="space-y-1.5 p-4">
                <div className="flex flex-wrap items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-[var(--muted)]">
                  <span>{message.name}</span>
                  {message.organisation && (
                    <>
                      <span>·</span>
                      <span className="truncate">{message.organisation}</span>
                    </>
                  )}
                  <span>·</span>
                  <span>{message.email}</span>
                  <span>·</span>
                  <span>{formatDate(message.createdAt)}</span>
                  {message.status === 'new' && (
                    <span className="rounded-full bg-[var(--signal)]/10 px-2 py-0.5 text-[var(--signal)]">Unread</span>
                  )}
                </div>
                {message.subject && <p className="text-sm font-medium text-[var(--ink)]">{message.subject}</p>}
                {/* Plain text child, never dangerouslySetInnerHTML — the sender is anonymous and
                    untrusted (specs/contact-messages/spec.md - "A message body is rendered as
                    plain text in the admin inbox"). */}
                <p className="whitespace-pre-wrap text-sm text-[var(--ink)]">{message.message}</p>
                <div className="flex items-center gap-3 pt-1">
                  <button
                    type="button"
                    onClick={() => void toggleStatus(message)}
                    disabled={toggleState.loading}
                    className="font-mono text-xs uppercase tracking-wide text-[var(--muted)] hover:text-[var(--ink)] disabled:opacity-50"
                  >
                    {message.status === 'new' ? 'Mark read' : 'Mark unread'}
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
