import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { SessionProvider } from './SessionContext.js';
import { RequireSession } from './RouteGuards.js';
import { AppShell } from '../components/AppShell.js';
import { sessionApi } from '../lib/sessionApi.js';

vi.mock('../lib/sessionApi.js', () => ({ sessionApi: { me: vi.fn(), logout: vi.fn() } }));

afterEach(() => cleanup());

function renderApp() {
  return render(
    <MemoryRouter initialEntries={['/articles']}>
      <SessionProvider>
        <Routes>
          <Route path="/login" element={<div>Login Screen</div>} />
          <Route
            element={
              <RequireSession>
                <AppShell />
              </RequireSession>
            }
          >
            <Route path="/articles" element={<div>Articles Page</div>} />
          </Route>
        </Routes>
      </SessionProvider>
    </MemoryRouter>,
  );
}

/**
 * End-to-end through the real `SessionProvider` + `RequireSession` + `AppShell`: activating
 * sign-out calls the endpoint, clears local state, and lands on `/login` — whether or not the
 * sign-out call itself succeeded (specs/admin-session/spec.md - "A failed sign-out call still
 * returns to sign-in").
 */
describe('sign-out end to end', () => {
  it('returns to /login after a successful sign-out call', async () => {
    vi.mocked(sessionApi.me).mockResolvedValue({ id: 'staff-1', isOwner: true, permissionKeys: [], mustChangePassword: false } as never);
    vi.mocked(sessionApi.logout).mockResolvedValue(undefined);

    renderApp();
    await waitFor(() => expect(screen.getByText('Articles Page')).toBeTruthy());

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    });

    expect(screen.getByText('Login Screen')).toBeTruthy();
  });

  it('still returns to /login when the sign-out call itself fails', async () => {
    vi.mocked(sessionApi.me).mockResolvedValue({ id: 'staff-1', isOwner: true, permissionKeys: [], mustChangePassword: false } as never);
    vi.mocked(sessionApi.logout).mockRejectedValue(new Error('network error'));

    renderApp();
    await waitFor(() => expect(screen.getByText('Articles Page')).toBeTruthy());

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    });

    expect(screen.getByText('Login Screen')).toBeTruthy();
  });
});
