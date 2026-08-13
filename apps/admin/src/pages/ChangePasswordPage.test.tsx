import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ChangePasswordPage } from './ChangePasswordPage.js';
import { sessionApi } from '../lib/sessionApi.js';
import { ApiError } from '../lib/api.js';
import { useSession } from '../session/SessionContext.js';

vi.mock('../lib/sessionApi.js', () => ({ sessionApi: { changePassword: vi.fn() } }));
vi.mock('../session/SessionContext.js', () => ({ useSession: vi.fn() }));

afterEach(() => cleanup());

function submit(current = 'old-pass', next = 'new-password-1') {
  fireEvent.change(screen.getByLabelText('Current password'), { target: { value: current } });
  fireEvent.change(screen.getByLabelText('New password'), { target: { value: next } });
  fireEvent.click(screen.getByRole('button', { name: 'Change password' }));
}

describe('ChangePasswordPage', () => {
  /** specs/admin-session/spec.md - "A successful change releases the restriction". */
  it('re-resolves session state after a successful change and navigates into the app', async () => {
    vi.mocked(sessionApi.changePassword).mockResolvedValue(undefined);
    const refreshAccount = vi.fn().mockResolvedValue(undefined);
    vi.mocked(useSession).mockReturnValue({
      session: { status: 'authenticated', account: { mustChangePassword: true } as never },
      refreshAccount,
      signIn: vi.fn(),
      signOut: vi.fn(),
    });

    render(
      <MemoryRouter initialEntries={['/change-password']}>
        <Routes>
          <Route path="/change-password" element={<ChangePasswordPage />} />
          <Route path="/articles" element={<div>Articles</div>} />
        </Routes>
      </MemoryRouter>,
    );

    await act(async () => submit());

    expect(sessionApi.changePassword).toHaveBeenCalledWith('old-pass', 'new-password-1');
    expect(refreshAccount).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.getByText('Articles')).toBeTruthy());
  });

  it('shows the server error message on failure and does not re-resolve session state', async () => {
    vi.mocked(sessionApi.changePassword).mockRejectedValue(new ApiError('Current password is incorrect', 401));
    const refreshAccount = vi.fn();
    vi.mocked(useSession).mockReturnValue({
      session: { status: 'authenticated', account: { mustChangePassword: true } as never },
      refreshAccount,
      signIn: vi.fn(),
      signOut: vi.fn(),
    });

    render(
      <MemoryRouter initialEntries={['/change-password']}>
        <Routes>
          <Route path="/change-password" element={<ChangePasswordPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await act(async () => submit());

    expect(screen.getByText('Current password is incorrect')).toBeTruthy();
    expect(refreshAccount).not.toHaveBeenCalled();
  });

  /** The change screen is the only route a confined caller can reach (session/RouteGuards.tsx),
   *  so it carries its own way out rather than relying on AppShell's, which never renders here. */
  it('offers a sign-out control, since this screen renders outside AppShell', async () => {
    const signOut = vi.fn().mockResolvedValue(undefined);
    vi.mocked(useSession).mockReturnValue({
      session: { status: 'authenticated', account: { mustChangePassword: true } as never },
      refreshAccount: vi.fn(),
      signIn: vi.fn(),
      signOut,
    });

    render(
      <MemoryRouter initialEntries={['/change-password']}>
        <Routes>
          <Route path="/change-password" element={<ChangePasswordPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await act(async () => {
      screen.getByRole('button', { name: 'Sign out' }).click();
    });

    expect(signOut).toHaveBeenCalledTimes(1);
  });
});
