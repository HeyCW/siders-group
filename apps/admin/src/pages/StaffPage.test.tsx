import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { RoleSummaryResponse, StaffListItemResponse } from '@siders/contracts';
import { StaffPage } from './StaffPage.js';
import { staffApi } from '../lib/staffApi.js';
import { rolesApi } from '../lib/rolesApi.js';
import { useSession } from '../session/SessionContext.js';

vi.mock('../lib/staffApi.js', () => ({
  staffApi: { list: vi.fn(), create: vi.fn(), disable: vi.fn(), reset: vi.fn() },
}));
vi.mock('../lib/rolesApi.js', () => ({
  rolesApi: { list: vi.fn(), assign: vi.fn() },
}));
vi.mock('../session/SessionContext.js', () => ({ useSession: vi.fn() }));

afterEach(() => cleanup());

const OWNER_ROLE: RoleSummaryResponse = { id: 'owner-role-id', name: 'Owner', slug: 'owner', isSystem: true, holderCount: 1 };
const EDITOR_ROLE: RoleSummaryResponse = { id: 'editor-role-id', name: 'Editor', slug: 'editor', isSystem: false, holderCount: 2 };

function staffEntry(overrides: Partial<StaffListItemResponse> & Pick<StaffListItemResponse, 'id'>): StaffListItemResponse {
  return {
    email: 'user@example.com',
    name: 'User',
    roleId: 'editor-role-id',
    roleName: 'Editor',
    status: 'active',
    mustChangePassword: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function mockAccount(overrides: { id?: string; permissionKeys?: string[]; isOwner?: boolean } = {}) {
  vi.mocked(useSession).mockReturnValue({
    session: {
      status: 'authenticated',
      account: {
        id: overrides.id ?? 'caller-1',
        email: 'caller@example.com',
        name: 'Caller',
        roleId: 'editor-role-id',
        roleName: 'Editor',
        status: 'active',
        mustChangePassword: false,
        createdAt: '2026-01-01T00:00:00.000Z',
        permissionKeys: overrides.permissionKeys ?? ['user.manage', 'role.manage'],
        isOwner: overrides.isOwner ?? false,
      },
    },
    refreshAccount: vi.fn(),
    signIn: vi.fn(),
    signOut: vi.fn(),
  });
}

async function renderPage(staff: StaffListItemResponse[] = [], roles: RoleSummaryResponse[] = [EDITOR_ROLE, OWNER_ROLE]) {
  vi.mocked(staffApi.list).mockResolvedValue(staff);
  vi.mocked(rolesApi.list).mockResolvedValue(roles);
  render(<StaffPage />);
  await waitFor(() => expect(staffApi.list).toHaveBeenCalled());
}

describe('StaffPage — list', () => {
  // specs/staff-account-management/spec.md - "Accounts are listed by name with disabled ones de-emphasized".
  it('lists accounts ordered by name', async () => {
    mockAccount();
    await renderPage([staffEntry({ id: 'z', name: 'Zed' }), staffEntry({ id: 'a', name: 'Alice' })]);

    const names = screen.getAllByText(/^(Alice|Zed)$/).map((el) => el.textContent);
    expect(names).toEqual(['Alice', 'Zed']);
  });

  it('renders a disabled account de-emphasized, not hidden', async () => {
    mockAccount();
    await renderPage([staffEntry({ id: 'a', name: 'Alice', email: 'alice@example.com', status: 'disabled' })]);

    // Still rendered — disabled means de-emphasized, not absent from the list.
    expect(screen.getByText('alice@example.com')).toBeTruthy();
    expect(screen.getByText('Disabled')).toBeTruthy();
  });
});

describe('StaffPage — per-permission control visibility', () => {
  // specs/staff-account-management/spec.md - "Controls follow the governing permission".
  it('offers only the role-change control to a role.manage-only caller', async () => {
    mockAccount({ id: 'caller-1', permissionKeys: ['role.manage'] });
    await renderPage([staffEntry({ id: 'other', name: 'Other' })]);

    // Disambiguated from the "New account" form's own role picker (also labeled "Role") by the
    // per-row `aria-label` `StaffPage.tsx` assigns.
    expect(screen.getByLabelText('Role for Other')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Disable' })).toBeNull();
    expect(screen.queryByText('New account')).toBeNull();
  });

  it('offers create/disable/reset but not role-change to a user.manage-only caller', async () => {
    mockAccount({ id: 'caller-1', permissionKeys: ['user.manage'] });
    await renderPage([staffEntry({ id: 'other', name: 'Other' })]);

    expect(screen.getByText('New account')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Disable' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Reset' })).toBeTruthy();
    expect(screen.queryByLabelText('Role for Other')).toBeNull();
  });
});

describe('StaffPage — self-row suppression', () => {
  // specs/staff-account-management/spec.md - "The caller's own row offers no self-administration".
  it('offers no role-change or disable control on the caller\'s own row', async () => {
    mockAccount({ id: 'caller-1', permissionKeys: ['user.manage', 'role.manage'] });
    await renderPage([staffEntry({ id: 'caller-1', name: 'Caller' })]);

    expect(screen.queryByLabelText('Role for Caller')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Disable' })).toBeNull();
  });
});

describe('StaffPage — Owner-row suppression', () => {
  // specs/staff-account-management/spec.md - "A non-Owner is offered no controls over an Owner account".
  it('offers no role-change, disable, or reset control over an Owner account to a non-Owner', async () => {
    mockAccount({ id: 'caller-1', permissionKeys: ['user.manage', 'role.manage'], isOwner: false });
    await renderPage([staffEntry({ id: 'owner-1', name: 'The Owner', roleId: 'owner-role-id', roleName: 'Owner' })]);

    expect(screen.queryByLabelText('Role for The Owner')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Disable' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Reset' })).toBeNull();
  });

  it('offers full controls over an Owner account to an Owner caller', async () => {
    mockAccount({ id: 'caller-1', permissionKeys: ['user.manage', 'role.manage'], isOwner: true });
    await renderPage([staffEntry({ id: 'owner-1', name: 'The Owner', roleId: 'owner-role-id', roleName: 'Owner' })]);

    expect(screen.getByLabelText('Role for The Owner')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Disable' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Reset' })).toBeTruthy();
  });
});

describe('StaffPage — temporary password disclosure', () => {
  it('shows the panel after creating an account', async () => {
    mockAccount({ permissionKeys: ['user.manage', 'role.manage'] });
    await renderPage([]);

    vi.mocked(staffApi.create).mockResolvedValue({
      id: 'new-1',
      email: 'new@example.com',
      name: 'New Person',
      roleId: 'editor-role-id',
      roleName: 'Editor',
      status: 'active',
      mustChangePassword: true,
      createdAt: '2026-01-01T00:00:00.000Z',
      temporaryPassword: 'temp-pw-123',
    });

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'New Person' } });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'new@example.com' } });
    fireEvent.change(screen.getByLabelText('Role'), { target: { value: 'editor-role-id' } });

    await act(async () => {
      screen.getByRole('button', { name: 'Create account' }).click();
    });

    expect(await screen.findByText('temp-pw-123')).toBeTruthy();
    expect(screen.getByText(/will not be shown again/i)).toBeTruthy();
  });

  it('shows the panel after resetting an account, and it is gone after dismissal', async () => {
    mockAccount({ permissionKeys: ['user.manage', 'role.manage'] });
    await renderPage([staffEntry({ id: 'a', name: 'Alice' })]);

    vi.mocked(staffApi.reset).mockResolvedValue({ temporaryPassword: 'reset-pw-456' });
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    await act(async () => {
      screen.getByRole('button', { name: 'Reset' }).click();
    });

    expect(await screen.findByText('reset-pw-456')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByText('reset-pw-456')).toBeNull();
  });
});
