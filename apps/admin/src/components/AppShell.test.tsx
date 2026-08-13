import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AppShell } from './AppShell.js';
import { useSession } from '../session/SessionContext.js';

vi.mock('../session/SessionContext.js', () => ({ useSession: vi.fn() }));

afterEach(() => cleanup());

function mockAuthenticated(account: { permissionKeys: string[]; isOwner: boolean }, signOut = vi.fn()) {
  vi.mocked(useSession).mockReturnValue({
    session: { status: 'authenticated', account: account as never },
    refreshAccount: vi.fn(),
    signIn: vi.fn(),
    signOut,
  });
}

function renderShell() {
  return render(
    <MemoryRouter initialEntries={['/articles']}>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/articles" element={<div>Articles Page</div>} />
          <Route path="/categories" element={<div>Categories Page</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

/** specs/admin-session/spec.md - "Permission-aware rendering is cosmetic, never authoritative"
 *  and specs/authorization/spec.md - "Owner sees every permission-gated affordance". */
describe('AppShell navigation', () => {
  it('shows only the nav items covered by the caller\'s reported permissions', () => {
    mockAuthenticated({ permissionKeys: ['news.manage'], isOwner: false });
    renderShell();

    // Articles and Curation both require 'news.manage' (curation.routes.ts).
    expect(screen.getByText('Articles')).toBeTruthy();
    expect(screen.getByText('Curation')).toBeTruthy();
    expect(screen.queryByText('Categories')).toBeNull();
    expect(screen.queryByText('Tags')).toBeNull();
  });

  it('hides every permission-gated item when the caller holds none of them', () => {
    mockAuthenticated({ permissionKeys: [], isOwner: false });
    renderShell();

    expect(screen.queryByText('Articles')).toBeNull();
    expect(screen.queryByText('Categories')).toBeNull();
  });

  it('shows every permission-gated nav item for the Owner role, regardless of explicit permissions', () => {
    mockAuthenticated({ permissionKeys: [], isOwner: true });
    renderShell();

    expect(screen.getByText('Articles')).toBeTruthy();
    expect(screen.getByText('Categories')).toBeTruthy();
    expect(screen.getByText('Tags')).toBeTruthy();
    expect(screen.getByText('Curation')).toBeTruthy();
  });
});

/** specs/admin-session/spec.md - "Sign-out calls the endpoint and returns to sign-in". */
describe('AppShell sign-out control', () => {
  it('calls signOut when the sign-out control is activated', async () => {
    const signOut = vi.fn().mockResolvedValue(undefined);
    mockAuthenticated({ permissionKeys: ['news.manage'], isOwner: false }, signOut);
    renderShell();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    });

    expect(signOut).toHaveBeenCalledTimes(1);
  });
});
