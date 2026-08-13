import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { sessionApi } from '../lib/sessionApi.js';
import { ApiError } from '../lib/api.js';
import { useSession } from '../session/SessionContext.js';
import { DEFAULT_LANDING_ROUTE } from '../session/redirectTarget.js';

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
  const { refreshAccount } = useSession();
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
    <div className="mx-auto mt-24 max-w-sm p-6">
      <h1 className="mb-2 text-2xl font-bold text-gray-900 dark:text-white">Change your password</h1>
      <p className="mb-6 text-sm text-gray-500 dark:text-gray-400">You must set a new password before continuing.</p>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="currentPassword" className="block text-sm text-gray-700 dark:text-gray-300">
            Current password
          </label>
          <input
            id="currentPassword"
            type="password"
            autoComplete="current-password"
            required
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-800"
          />
        </div>
        <div>
          <label htmlFor="newPassword" className="block text-sm text-gray-700 dark:text-gray-300">
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
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-800"
          />
        </div>

        {errorMessage && <p className="text-sm text-red-600 dark:text-red-400">{errorMessage}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-md bg-blue-600 px-3 py-1.5 text-sm text-white disabled:opacity-50"
        >
          Change password
        </button>
      </form>
    </div>
  );
}
