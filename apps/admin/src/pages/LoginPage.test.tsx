import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { LoginPage } from './LoginPage.js';
import { sessionApi } from '../lib/sessionApi.js';
import { useSession } from '../session/SessionContext.js';
import { DEFAULT_LANDING_ROUTE } from '../session/redirectTarget.js';

vi.mock('../lib/sessionApi.js', () => ({ sessionApi: { login: vi.fn() } }));
vi.mock('../session/SessionContext.js', () => ({ useSession: vi.fn() }));

afterEach(() => cleanup());

function renderAt(path: string, state?: unknown) {
  return render(
    <MemoryRouter initialEntries={[{ pathname: path, state }]}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/change-password" element={<div>Change Password Screen</div>} />
        <Route path="/articles/42" element={<div>Article 42</div>} />
        <Route path={DEFAULT_LANDING_ROUTE} element={<div>Landing</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

function fillAndSubmit(email = 'a@b.com', password = 'whatever1') {
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: email } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: password } });
  fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
}

describe('LoginPage', () => {
  beforeEach(() => {
    vi.mocked(sessionApi.login).mockReset();
  });

  /** specs/admin-session/spec.md - "Ordinary sign-in enters the app". */
  it('enters the app at the preserved deep-link target on ordinary sign-in', async () => {
    vi.mocked(sessionApi.login).mockResolvedValue(undefined);
    vi.mocked(useSession).mockReturnValue({
      session: { status: 'unauthenticated' },
      refreshAccount: vi.fn(),
      signIn: vi.fn().mockResolvedValue({ mustChangePassword: false }),
      signOut: vi.fn(),
    });

    renderAt('/login', { from: '/articles/42' });
    await act(async () => fillAndSubmit());

    await waitFor(() => expect(screen.getByText('Article 42')).toBeTruthy());
  });

  /** specs/admin-session/spec.md - "No preserved target defaults to the landing route". */
  it('enters the app at the default landing route with no preserved target', async () => {
    vi.mocked(sessionApi.login).mockResolvedValue(undefined);
    vi.mocked(useSession).mockReturnValue({
      session: { status: 'unauthenticated' },
      refreshAccount: vi.fn(),
      signIn: vi.fn().mockResolvedValue({ mustChangePassword: false }),
      signOut: vi.fn(),
    });

    renderAt('/login');
    await act(async () => fillAndSubmit());

    await waitFor(() => expect(screen.getByText('Landing')).toBeTruthy());
  });

  /** specs/admin-session/spec.md - "Sign-in for an account requiring a password change enters
   *  the forced-change screen". */
  it('routes to the forced password-change screen instead of the preserved target', async () => {
    vi.mocked(sessionApi.login).mockResolvedValue(undefined);
    vi.mocked(useSession).mockReturnValue({
      session: { status: 'unauthenticated' },
      refreshAccount: vi.fn(),
      signIn: vi.fn().mockResolvedValue({ mustChangePassword: true }),
      signOut: vi.fn(),
    });

    renderAt('/login', { from: '/articles/42' });
    await act(async () => fillAndSubmit());

    await waitFor(() => expect(screen.getByText('Change Password Screen')).toBeTruthy());
  });

  /** specs/admin-session/spec.md - "Invalid credentials produce the generic message" /
   *  "A throttled attempt produces the same generic message" / "The failure message never
   *  names a field": the screen shows one fixed message regardless of the rejection's cause. */
  it.each([
    { code: 'invalid_credentials', label: 'an unknown email or wrong password' },
    { code: 'rate_limited', label: 'a throttled attempt' },
  ])('shows the same generic failure message for $label', async ({ code }) => {
    vi.mocked(sessionApi.login).mockRejectedValue(Object.assign(new Error('rejected'), { status: 401, code }));
    vi.mocked(useSession).mockReturnValue({
      session: { status: 'unauthenticated' },
      refreshAccount: vi.fn(),
      signIn: vi.fn(),
      signOut: vi.fn(),
    });

    renderAt('/login');
    await act(async () => fillAndSubmit());

    expect(screen.getByText('Invalid email or password.')).toBeTruthy();
  });
});
