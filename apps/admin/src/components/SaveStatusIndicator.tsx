export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

/** Visible save-status indicator for autosave (specs/article-management/spec.md - "Edits are
 *  autosaved"; tasks.md 11.2 - "wired to autosave with a visible save-status indicator"). A
 *  colored dot rather than just text — the same "live state" language as the sidebar's clock
 *  and the login page's LIVE indicator. Assumes a `.siders-scope` ancestor for its color tokens. */
export function SaveStatusIndicator({ status, errorMessage }: { status: SaveStatus; errorMessage?: string | null }) {
  if (status === 'idle') return null;

  const label = status === 'saving' ? 'Saving…' : status === 'saved' ? 'Saved' : (errorMessage ?? 'Could not save');

  const dotColor =
    status === 'saving' ? 'bg-[var(--muted)]' : status === 'saved' ? 'bg-[var(--status-published)]' : 'bg-red-500';

  const textColor =
    status === 'saving'
      ? 'text-[var(--muted)]'
      : status === 'saved'
        ? 'text-[var(--status-published)]'
        : 'text-red-600 dark:text-red-400';

  return (
    <span className={`flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wide ${textColor}`} role="status">
      <span className={`h-1.5 w-1.5 rounded-full ${dotColor} ${status === 'saving' ? 'motion-safe:animate-pulse' : ''}`} />
      {label}
    </span>
  );
}
