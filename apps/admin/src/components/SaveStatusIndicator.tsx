export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

/** Visible save-status indicator for autosave (specs/article-management/spec.md - "Edits are
 *  autosaved"; tasks.md 11.2 - "wired to autosave with a visible save-status indicator"). */
export function SaveStatusIndicator({ status, errorMessage }: { status: SaveStatus; errorMessage?: string | null }) {
  if (status === 'idle') return null;

  const label =
    status === 'saving' ? 'Saving…' : status === 'saved' ? 'Saved' : (errorMessage ?? 'Could not save');

  const color =
    status === 'saving'
      ? 'text-gray-500 dark:text-gray-400'
      : status === 'saved'
        ? 'text-green-600 dark:text-green-400'
        : 'text-red-600 dark:text-red-400';

  return (
    <span className={`text-xs font-medium ${color}`} role="status">
      {label}
    </span>
  );
}
