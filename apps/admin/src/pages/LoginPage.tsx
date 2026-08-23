import { useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { sessionApi } from '../lib/sessionApi.js';
import { useSession } from '../session/SessionContext.js';
import { resolveInAppTarget } from '../session/redirectTarget.js';
import { useDarkMode } from '../hooks/useDarkMode.js';
import { Button } from '../components/ui/Button.js';

interface PulseItem {
  time: string;
  tag: string;
  text: string;
}

/**
 * Static, illustrative snapshot of the kind of activity the real dashboard tracks
 * (pipeline, schedule, guideline curation, taxonomy — see DashboardPage) — not a live feed.
 * It exists to make the login screen feel like the front door of a running newsroom
 * console rather than an anonymous auth form.
 */
const PULSE_ITEMS: PulseItem[] = [
  { time: '08:42', tag: 'Pipeline', text: '3 drafts moved to review' },
  { time: '08:37', tag: 'Schedule', text: '1 article queued for the 6:00 PM slot' },
  { time: '08:24', tag: 'Guideline', text: 'Guideline of the week refreshed' },
  { time: '08:11', tag: 'Taxonomy', text: '2 uncategorized articles cleared' },
];

function PulsePanel() {
  return (
    <aside className="relative hidden flex-col justify-between overflow-hidden bg-[var(--panel-bg)] px-12 py-10 text-[var(--panel-fg)] lg:flex lg:w-[58%]">
      <div>
        <div className="flex items-center gap-3">
          <span className="font-display text-2xl tracking-tight">Siders</span>
          <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-[var(--panel-fg)]/60">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--panel-signal)] motion-safe:animate-pulse" />
            Live
          </span>
        </div>
        <div className="mt-4 h-px w-full bg-[var(--panel-fg)]/15" />
      </div>

      <ul className="space-y-5 font-mono text-sm">
        {PULSE_ITEMS.map((item, index) => (
          <li
            key={item.tag}
            className="flex gap-4 motion-safe:animate-[fadeInUp_0.5s_ease_forwards] motion-safe:opacity-0"
            style={{ animationDelay: `${index * 140}ms` }}
          >
            <span className="shrink-0 text-[var(--panel-fg)]/40">{item.time}</span>
            <span>
              <span className="mr-2 rounded-sm bg-[var(--panel-signal)]/20 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-[var(--panel-signal)]">
                {item.tag}
              </span>
              <span className="text-[var(--panel-fg)]/85">{item.text}</span>
            </span>
          </li>
        ))}
      </ul>

      <p className="font-mono text-xs text-[var(--panel-fg)]/40">Siders editorial console</p>
    </aside>
  );
}

function MobileMasthead() {
  return (
    <div className="flex items-center justify-between bg-[var(--panel-bg)] px-6 py-4 text-[var(--panel-fg)] lg:hidden">
      <span className="font-display text-xl tracking-tight">Siders</span>
      <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-[var(--panel-fg)]/60">
        <span className="h-1.5 w-1.5 rounded-full bg-[var(--panel-signal)] motion-safe:animate-pulse" />
        Live
      </span>
    </div>
  );
}

/**
 * One fixed message for any rejected attempt — an unknown email, a wrong password, and a
 * throttled attempt are all indistinguishable server-side already
 * (specs/authentication/spec.md - "Throttling does not leak account existence"); this screen's
 * job is to not undo that by branching on the server's `code` or surfacing its message text
 * (specs/admin-session/spec.md - "Sign-in failure is reported generically").
 */
const GENERIC_FAILURE_MESSAGE = 'Invalid email or password.';

// After this many failed submits in one visit, show a generic retry hint. Deliberately vague —
// it must read the same whether the real cause is a typo, a per-account lockout, or the
// per-source cap, so it can never confirm which one is happening
// (specs/authentication/spec.md - "Throttling does not leak account existence").
const FAILURES_BEFORE_HINT = 3;

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { signIn } = useSession();
  const [isDark, toggleDark] = useDarkMode();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [failed, setFailed] = useState(false);
  const [failCount, setFailCount] = useState(0);

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
      setFailCount((prev) => prev + 1);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="siders-scope flex min-h-screen w-full flex-col bg-[var(--paper)] text-[var(--ink)] lg:flex-row">
      <PulsePanel />
      <MobileMasthead />

      <main className="relative flex flex-1 items-center justify-center px-6 py-12">
        <button
          type="button"
          onClick={toggleDark}
          aria-label="Toggle dark mode"
          className="absolute right-6 top-6 rounded-md border border-[var(--rule)] px-2.5 py-1 text-xs"
        >
          {isDark ? '☀' : '🌙'}
        </button>

        <div className="w-full max-w-sm">
          <h1 className="font-display text-3xl">Sign in</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">Editorial console access.</p>
          <div className="mt-6 h-px bg-[var(--rule)]" />

          {failed && (
            <div
              role="alert"
              aria-live="polite"
              className="mt-6 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300"
            >
              <p>{GENERIC_FAILURE_MESSAGE}</p>
              {failCount >= FAILURES_BEFORE_HINT && (
                <p className="mt-1 text-red-700/80 dark:text-red-300/80">
                  Still not working? Wait a few minutes and try again, or ask an admin to check your account.
                </p>
              )}
            </div>
          )}

          <form onSubmit={handleSubmit} className="mt-6 space-y-5" noValidate>
            <div>
              <label htmlFor="email" className="block text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="mt-1.5 w-full rounded-md border border-[var(--rule)] bg-transparent px-3 py-2 text-sm text-[var(--ink)] placeholder:text-[var(--muted)]/60 focus:border-[var(--signal)] focus:outline-none focus:ring-2 focus:ring-[var(--signal)]/30"
                placeholder="you@siders.com"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
                Password
              </label>
              <div className="relative mt-1.5">
                <input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="w-full rounded-md border border-[var(--rule)] bg-transparent px-3 py-2 pr-16 text-sm text-[var(--ink)] focus:border-[var(--signal)] focus:outline-none focus:ring-2 focus:ring-[var(--signal)]/30"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute inset-y-0 right-0 px-3 text-xs font-medium text-[var(--muted)] hover:text-[var(--ink)]"
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>

            <Button type="submit" variant="primary" disabled={submitting} className="w-full py-2.5">
              {submitting ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>

          <p className="mt-6 text-center text-xs text-[var(--muted)]">Need access? Ask an admin to add your account.</p>
        </div>
      </main>
    </div>
  );
}
