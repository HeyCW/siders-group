import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { sessionApi } from '../lib/sessionApi.js';
import { ApiError } from '../lib/api.js';
import { useSession } from '../session/SessionContext.js';
import { DEFAULT_LANDING_ROUTE } from '../session/redirectTarget.js';
import { Button } from '../components/ui/Button.js';

const FIELD_LABEL = 'block text-xs font-medium uppercase tracking-wide text-[var(--muted)]';
const TEXT_INPUT =
  'mt-1.5 w-full rounded-md border border-[var(--rule)] bg-transparent px-3 py-2 text-sm text-[var(--ink)] focus:border-[var(--signal)] focus:outline-none focus:ring-2 focus:ring-[var(--signal)]/30';

/**
 * Shown whenever the probed account reports `mustChangePassword`
 * (specs/admin-session/spec.md - "A pending password change confines the app to the change
 * screen"). `RequireSession` (session/RouteGuards.tsx) is what actually blocks navigation to
 * every other route while the flag is set — this screen only has to lift it.
 */
export function ChangePasswordPage() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const { refreshAccount, signOut } = useSession();
  const navigate = useNavigate();

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setSubmitting(true);
    setErrorMessage(null);
    try {
      await sessionApi.changePassword(currentPassword, newPassword);
      // Re-resolves session state so the restriction lifts without a fresh sign-in
      // (specs/admin-session/spec.md - "A successful change releases the restriction").
      await refreshAccount();
      navigate(DEFAULT_LANDING_ROUTE, { replace: true });
    } catch (err) {
      setErrorMessage(err instanceof ApiError ? err.message : 'Could not change your password.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="siders-scope flex min-h-screen w-full items-center justify-center bg-[var(--paper)] px-6 py-12 text-[var(--ink)]">
      <div className="w-full max-w-sm">
        <div className="mb-1 flex items-start justify-between gap-4">
          <h1 className="font-display text-3xl">Change your password</h1>
          {/* This screen has no other route to navigate to while mustChangePassword is set
              (session/RouteGuards.tsx), so it needs its own way out. */}
          <Button variant="ghost" onClick={() => void signOut()} className="mt-2 shrink-0">
            Sign out
          </Button>
        </div>
        <p className="mt-1 text-sm text-[var(--muted)]">You must set a new password before continuing.</p>
        <div className="mt-6 h-px bg-[var(--rule)]" />

        <form onSubmit={handleSubmit} className="mt-6 space-y-5">
          <div>
            <label htmlFor="currentPassword" className={FIELD_LABEL}>
              Current password
            </label>
            <input
              id="currentPassword"
              type="password"
              autoComplete="current-password"
              required
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className={TEXT_INPUT}
            />
          </div>
          <div>
            <label htmlFor="newPassword" className={FIELD_LABEL}>
              New password
            </label>
            <input
              id="newPassword"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className={TEXT_INPUT}
            />
          </div>

          {errorMessage && <p className="text-sm text-red-600 dark:text-red-400">{errorMessage}</p>}

          <Button type="submit" variant="primary" disabled={submitting} className="w-full">
            {submitting ? 'Changing…' : 'Change password'}
          </Button>
        </form>
      </div>
    </div>
  );
}
