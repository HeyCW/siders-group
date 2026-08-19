import { useState } from 'react';
import { Button } from './ui/Button.js';

export interface TemporaryPasswordPanelProps {
  /** Whose credential this is, for the panel's heading (e.g. "New Editor"). */
  accountLabel: string;
  temporaryPassword: string;
  onDismiss: () => void;
}

/**
 * Discloses a server-generated temporary password exactly once, after a staff account is
 * created or its credentials are reset — the API returns it in that one response and never
 * again (specs/staff-account-management/spec.md - "One-time disclosure of a generated temporary
 * password"). The value is a prop, not fetched or cached here: once the panel is dismissed or
 * the page reloads, nothing in this app can produce it again.
 */
export function TemporaryPasswordPanel({ accountLabel, temporaryPassword, onDismiss }: TemporaryPasswordPanelProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(temporaryPassword);
      setCopied(true);
    } catch {
      /* clipboard access can be denied by the browser; the value is still shown for manual copy */
    }
  }

  return (
    <div className="mb-4 rounded-lg border border-[var(--signal)]/40 bg-[var(--signal)]/5 p-4">
      <p className="font-mono text-xs uppercase tracking-widest text-[var(--muted)]">
        Temporary password — {accountLabel}
      </p>
      <p className="mt-2 select-all break-all rounded-md bg-[var(--ink)]/[0.04] px-3 py-2 font-mono text-sm">
        {temporaryPassword}
      </p>
      <p className="mt-2 text-xs text-[var(--muted)]">
        This will not be shown again. Copy it now and share it with the staff member through a secure channel.
      </p>
      <div className="mt-3 flex items-center gap-3">
        <Button type="button" variant="secondary" size="sm" onClick={handleCopy}>
          {copied ? 'Copied' : 'Copy'}
        </Button>
        <Button type="button" variant="ghost" onClick={onDismiss}>
          Dismiss
        </Button>
      </div>
    </div>
  );
}
