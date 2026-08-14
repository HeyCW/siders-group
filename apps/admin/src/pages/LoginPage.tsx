import { useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { sessionApi } from '../lib/sessionApi.js';
import { useSession } from '../session/SessionContext.js';
import { resolveInAppTarget } from '../session/redirectTarget.js';

/**
 * One fixed message for any rejected attempt — an unknown email, a wrong password, and a
 * throttled attempt are all indistinguishable server-side already
 * (specs/authentication/spec.md - "Throttling does not leak account existence"); this screen's
 * job is to not undo that by branching on the server's `code`
 * (specs/admin-session/spec.md - "Sign-in failure is reported generically").
 */
const GENERIC_FAILURE_MESSAGE = 'Invalid email or password.';

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [failed, setFailed] = useState(false);
  const { signIn } = useSession();
  const navigate = useNavigate();
  const location = useLocation();

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setSubmitting(true);
    setFailed(false);
    try {
      // A 403 csrf_failed here is recovered transparently by apiFetch's own interceptor
      // (bootstrap + one retry) before this ever rejects — the failure message below is for a
      // genuinely rejected attempt, not a stale-cookie retry that goes on to succeed
      // (specs/admin-session/spec.md - "Sign-in recovers from a stale CSRF cookie the same
      // way").
      await sessionApi.login(email, password);

      // The sign-in response carries no body, so the caller's own account is what decides
      // where to route next (specs/admin-session/spec.md - "Account state is determined from
      // the caller's own account").
      const account = await signIn();
      if (account.mustChangePassword) {
        navigate('/change-password', { replace: true });
        return;
      }
      const from = (location.state as { from?: unknown } | null)?.from;
      navigate(resolveInAppTarget(from), { replace: true });
    } catch {
      setFailed(true);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto mt-24 max-w-sm p-6">
      <h1 className="mb-6 text-2xl font-bold text-gray-900 dark:text-white">Sign in</h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="email" className="block text-sm text-gray-700 dark:text-gray-300">
            Email
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-800"
          />
        </div>
        <div>
          <label htmlFor="password" className="block text-sm text-gray-700 dark:text-gray-300">
            Password
          </label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-800"
          />
        </div>

        {failed && <p className="text-sm text-red-600 dark:text-red-400">{GENERIC_FAILURE_MESSAGE}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-md bg-blue-600 px-3 py-1.5 text-sm text-white disabled:opacity-50"
        >
          Sign in
        </button>
      </form>
    </div>
  );
}
