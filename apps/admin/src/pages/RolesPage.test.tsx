import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { RoleDetailResponse, RoleSummaryResponse } from '@siders/contracts';
import { RolesPage } from './RolesPage.js';
import { rolesApi } from '../lib/rolesApi.js';
import { mockAuthenticatedSession } from '../testing/mockSession.js';

vi.mock('../lib/rolesApi.js', () => ({
  rolesApi: {
    list: vi.fn(),
    detail: vi.fn(),
    permissionCatalog: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    assign: vi.fn(),
  },
}));
vi.mock('../session/SessionContext.js', () => ({ useSession: vi.fn() }));

afterEach(() => cleanup());

function role(overrides: Partial<RoleSummaryResponse> & Pick<RoleSummaryResponse, 'id'>): RoleSummaryResponse {
  return { name: 'Editor', slug: 'editor', isSystem: false, holderCount: 0, ...overrides };
}

/** Every RolesPage test reaches the page as a `role.manage` holder — that permission is what
 *  the page requires, so it is the one default this suite never overrides. */
function mockAccount(overrides: { roleId?: string; isOwner?: boolean } = {}) {
  mockAuthenticatedSession({ ...overrides, permissionKeys: ['role.manage'] });
}

/** Both the "New role" create form and an open edit row render a checkbox labeled with the
 *  same permission key, so `getByLabelText` alone is ambiguous — disambiguated by the `id`
 *  `PermissionEditor` assigns from its `idPrefix`, the same pattern `PartnersPage.test.tsx`
 *  uses for its duplicated "Website URL" label. */
function editCheckbox(roleId: string, key: string): HTMLInputElement {
  return screen
    .getAllByLabelText(key)
    .find((el) => el.id === `edit-role-${roleId}-${key}`) as HTMLInputElement;
}

async function renderPage(initial: RoleSummaryResponse[] = []) {
  vi.mocked(rolesApi.list).mockResolvedValue(initial);
  vi.mocked(rolesApi.permissionCatalog).mockResolvedValue([
    { key: 'news.manage', description: 'Manage news' },
    { key: 'role.manage', description: 'Manage roles' },
    { key: 'user.manage', description: 'Manage staff' },
  ]);
  render(<RolesPage />);
  await waitFor(() => expect(rolesApi.list).toHaveBeenCalled());
}

describe('RolesPage — list', () => {
  // specs/rbac-management/spec.md - "The console lists roles with holder counts".
  it('renders each role\'s holder count', async () => {
    mockAccount();
    await renderPage([role({ id: 'a', name: 'Editor', holderCount: 3 })]);

    expect(screen.getByText('3 holders')).toBeTruthy();
  });

  // specs/rbac-management/spec.md - "Deleting a role with holders is not offered".
  it('blocks delete for a role with holders and shows the holder count as the reason', async () => {
    mockAccount();
    await renderPage([role({ id: 'a', name: 'Editor', holderCount: 2 })]);

    const deleteControls = screen.getAllByText('Delete');
    expect(deleteControls).toHaveLength(1);
    expect(deleteControls[0]?.tagName).not.toBe('BUTTON');
    expect(deleteControls[0]?.getAttribute('title')).toContain('2 staff members');
  });

  it('offers delete for a role with zero holders', async () => {
    mockAccount();
    await renderPage([role({ id: 'a', name: 'Editor', holderCount: 0 })]);

    const deleteButton = screen.getByRole('button', { name: 'Delete' });
    expect(deleteButton).toBeTruthy();
  });

  // specs/rbac-management/spec.md - "The system role is protected in the console".
  it('offers no delete control at all for the system role, even with zero holders', async () => {
    mockAccount();
    await renderPage([role({ id: 'owner-role-id', name: 'Owner', isSystem: true, holderCount: 0 })]);

    expect(screen.queryByText('Delete')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull();
  });

  it('locks the role-management checkbox when editing the system role', async () => {
    mockAccount();
    await renderPage([role({ id: 'owner-role-id', name: 'Owner', isSystem: true, holderCount: 1 })]);

    vi.mocked(rolesApi.detail).mockResolvedValue({
      id: 'owner-role-id',
      name: 'Owner',
      slug: 'owner',
      isSystem: true,
      holderCount: 1,
      permissions: ['role.manage', 'user.manage'],
    } satisfies RoleDetailResponse);

    await act(async () => {
      screen.getByRole('button', { name: 'Edit' }).click();
    });
    await waitFor(() => expect(rolesApi.detail).toHaveBeenCalledWith('owner-role-id'));
    await screen.findByRole('button', { name: 'Save' });

    const checkbox = editCheckbox('owner-role-id', 'role.manage');
    expect(checkbox.checked).toBe(true);
    expect(checkbox.disabled).toBe(true);
  });
});

describe('RolesPage — self-lockout warning', () => {
  const detail: RoleDetailResponse = {
    id: 'caller-role-id',
    name: 'Admin',
    slug: 'admin',
    isSystem: false,
    holderCount: 1,
    permissions: ['role.manage', 'news.manage'],
  };

  // specs/rbac-management/spec.md - "Removing one's own role-management permission warns first".
  it('warns before removing role.manage from the role the caller currently holds', async () => {
    mockAccount({ roleId: 'caller-role-id' });
    await renderPage([role({ id: 'caller-role-id', name: 'Admin', holderCount: 1 })]);
    vi.mocked(rolesApi.detail).mockResolvedValue(detail);

    await act(async () => {
      screen.getByRole('button', { name: 'Edit' }).click();
    });
    await screen.findByRole('button', { name: 'Save' });

    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    await act(async () => {
      fireEvent.click(editCheckbox('caller-role-id', 'role.manage'));
    });
    await act(async () => {
      screen.getByRole('button', { name: 'Save' }).click();
    });

    expect(confirmSpy).toHaveBeenCalled();
    expect(rolesApi.update).not.toHaveBeenCalled();
  });

  // specs/rbac-management/spec.md - "Editing another role does not warn".
  it('does not warn when editing a role the caller does not hold', async () => {
    mockAccount({ roleId: 'some-other-role-id' });
    await renderPage([role({ id: 'caller-role-id', name: 'Admin', holderCount: 1 })]);
    vi.mocked(rolesApi.detail).mockResolvedValue(detail);
    vi.mocked(rolesApi.update).mockResolvedValue({
      id: 'caller-role-id',
      name: 'Admin',
      slug: 'admin',
      isSystem: false,
      permissions: ['news.manage'],
    });

    await act(async () => {
      screen.getByRole('button', { name: 'Edit' }).click();
    });
    await screen.findByRole('button', { name: 'Save' });

    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    await act(async () => {
      fireEvent.click(editCheckbox('caller-role-id', 'role.manage'));
    });
    await act(async () => {
      screen.getByRole('button', { name: 'Save' }).click();
    });

    expect(confirmSpy).not.toHaveBeenCalled();
    expect(rolesApi.update).toHaveBeenCalled();
  });

  it('proceeds once the warning is confirmed', async () => {
    mockAccount({ roleId: 'caller-role-id' });
    await renderPage([role({ id: 'caller-role-id', name: 'Admin', holderCount: 1 })]);
    vi.mocked(rolesApi.detail).mockResolvedValue(detail);
    vi.mocked(rolesApi.update).mockResolvedValue({
      id: 'caller-role-id',
      name: 'Admin',
      slug: 'admin',
      isSystem: false,
      permissions: ['news.manage'],
    });

    await act(async () => {
      screen.getByRole('button', { name: 'Edit' }).click();
    });
    await screen.findByRole('button', { name: 'Save' });

    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await act(async () => {
      fireEvent.click(editCheckbox('caller-role-id', 'role.manage'));
    });
    await act(async () => {
      screen.getByRole('button', { name: 'Save' }).click();
    });

    expect(rolesApi.update).toHaveBeenCalledWith('caller-role-id', { name: 'Admin', permissions: ['news.manage'] });
  });
});

describe('RolesPage — save renders the server response', () => {
  it('shows the state the server returned rather than the locally-edited state', async () => {
    mockAccount();
    await renderPage([role({ id: 'a', name: 'Editor', holderCount: 0 })]);
    vi.mocked(rolesApi.detail).mockResolvedValue({
      id: 'a',
      name: 'Editor',
      slug: 'editor',
      isSystem: false,
      holderCount: 0,
      permissions: [],
    });
    // The server renames it server-side (e.g. normalized) — the page must show this, not the
    // typed input value.
    vi.mocked(rolesApi.update).mockResolvedValue({
      id: 'a',
      name: 'Editor (renamed)',
      slug: 'editor-renamed',
      isSystem: false,
      permissions: ['news.manage'],
    });

    await act(async () => {
      screen.getByRole('button', { name: 'Edit' }).click();
    });
    await screen.findByRole('button', { name: 'Save' });

    await act(async () => {
      screen.getByRole('button', { name: 'Save' }).click();
    });

    await waitFor(() => expect(screen.getByText('Editor (renamed)')).toBeTruthy());
  });
});

describe('RolesPage — stale detail response', () => {
  // The bug this guards: role A's detail fetch is slow, role B's is fast. Without the
  // `editRequestRef` guard, A's response landing after B's would silently overwrite B's editor
  // with A's permission set, and a whole-set `PATCH` on save would persist it.
  it('a slower response for a previously-edited role does not overwrite the currently-edited role', async () => {
    mockAccount();
    await renderPage([
      role({ id: 'role-a', name: 'Role A', holderCount: 0 }),
      role({ id: 'role-b', name: 'Role B', holderCount: 0 }),
    ]);

    let resolveA!: (detail: RoleDetailResponse) => void;
    const pendingA = new Promise<RoleDetailResponse>((resolve) => {
      resolveA = resolve;
    });
    vi.mocked(rolesApi.detail).mockImplementation((id: string) => {
      if (id === 'role-a') return pendingA;
      return Promise.resolve({
        id: 'role-b',
        name: 'Role B',
        slug: 'role-b',
        isSystem: false,
        holderCount: 0,
        permissions: ['news.manage'],
      });
    });

    const editButtons = screen.getAllByRole('button', { name: 'Edit' });
    await act(async () => {
      editButtons[0]!.click(); // Role A — its detail() call hangs on `pendingA`.
    });
    await act(async () => {
      editButtons[1]!.click(); // Role B — resolves immediately, replacing the open editor.
    });
    await screen.findByRole('button', { name: 'Save' });

    // Role A's slow response finally lands, after Role B is already the open editor.
    await act(async () => {
      resolveA({
        id: 'role-a',
        name: 'Role A',
        slug: 'role-a',
        isSystem: false,
        holderCount: 0,
        permissions: ['contact.manage'],
      });
    });

    // Still Role B's checkboxes — A's stale response must not have overwritten them.
    const roleBCheckbox = screen
      .getAllByLabelText('news.manage')
      .find((el) => el.id === 'edit-role-role-b-news.manage') as HTMLInputElement;
    expect(roleBCheckbox.checked).toBe(true);
    expect(screen.queryByText(/contact\.manage/)).toBeNull();
  });
});

describe('RolesPage — failed detail fetch recovers', () => {
  // Before the fix, Save/Cancel lived only inside the success branch, so a rejected detail
  // fetch left the row with no control that could clear `editingId` — a permanent dead end
  // until the page reloaded.
  it('offers Cancel when the detail fetch fails, returning the row to its normal controls', async () => {
    mockAccount();
    await renderPage([role({ id: 'a', name: 'Editor', holderCount: 0 })]);
    // A plain (non-`ApiError`) rejection — `startEdit` falls back to a generic message for it.
    vi.mocked(rolesApi.detail).mockRejectedValue(new Error('network error'));

    await act(async () => {
      screen.getByRole('button', { name: 'Edit' }).click();
    });
    await screen.findByText('Could not load role');

    expect(screen.getByRole('button', { name: 'Cancel' })).toBeTruthy();
    await act(async () => {
      screen.getByRole('button', { name: 'Cancel' }).click();
    });

    // Back to the row's normal state: Edit is offered again, the error is gone.
    expect(screen.getByRole('button', { name: 'Edit' })).toBeTruthy();
    expect(screen.queryByText('Could not load role')).toBeNull();
  });
});
