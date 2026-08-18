import { vi } from 'vitest';
import { useSession } from '../session/SessionContext.js';

/**
 * Shared by any page test that needs an authenticated `useSession()` — extracted out of
 * `RolesPage.test.tsx` and `StaffPage.test.tsx`, which each defined their own near-identical
 * copy of this. The caller must still call `vi.mock('../session/SessionContext.js', () =>
 * ({ useSession: vi.fn() }))` at module scope in its own test file (vitest hoists `vi.mock`
 * calls, so it cannot be done here on the caller's behalf).
 */
export function mockAuthenticatedSession(overrides: {
  id?: string | undefined;
  roleId?: string | undefined;
  permissionKeys?: string[] | undefined;
  isOwner?: boolean | undefined;
}) {
  vi.mocked(useSession).mockReturnValue({
    session: {
      status: 'authenticated',
      account: {
        id: overrides.id ?? 'caller-1',
        email: 'caller@example.com',
        name: 'Caller',
        roleId: overrides.roleId ?? 'caller-role-id',
        roleName: 'Caller Role',
        status: 'active',
        mustChangePassword: false,
        createdAt: '2026-01-01T00:00:00.000Z',
        permissionKeys: overrides.permissionKeys ?? [],
        isOwner: overrides.isOwner ?? false,
      },
    },
    refreshAccount: vi.fn(),
    signIn: vi.fn(),
    signOut: vi.fn(),
  });
}
