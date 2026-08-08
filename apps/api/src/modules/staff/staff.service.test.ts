import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../lib/ownerRole.js', () => ({
  getOwnerRoleId: vi.fn().mockResolvedValue('owner-role-id'),
}));

import { createStaffService } from './staff.service.js';
import { verifyPassword } from '../../lib/password.js';
import type { CreateStaffInput, StaffRepository, StaffRow } from './staff.repository.js';
import type { CallerContext } from '../../lib/callerContext.js';

/** A `user.manage` holder who is not an Owner — the caller every Owner-only bar exists to stop. */
const ADMIN_CALLER: CallerContext = { subjectId: 'caller-1', isOwner: false };
const OWNER_CALLER: CallerContext = { subjectId: 'owner-caller', isOwner: true };

function makeStaffRow(overrides: Partial<StaffRow> = {}): StaffRow {
  return {
    id: randomUUID(),
    email: 'author@example.com',
    passwordHash: 'placeholder-hash',
    mustChangePassword: true,
    name: 'Author',
    roleId: 'author-role-id',
    roleName: 'Author',
    status: 'active',
    createdAt: new Date(),
    ...overrides,
  };
}

function createFakeStaffRepository() {
  const rows = new Map<string, StaffRow>();

  const repository: StaffRepository = {
    async findByEmail(email) {
      for (const row of rows.values()) if (row.email === email) return row;
      return null;
    },
    async findById(id) {
      return rows.get(id) ?? null;
    },
    async create(input: CreateStaffInput) {
      const row = makeStaffRow({
        email: input.email,
        name: input.name,
        roleId: input.roleId,
        passwordHash: input.passwordHash,
      });
      rows.set(row.id, row);
      return row;
    },
    async setPassword(id, passwordHash) {
      const row = rows.get(id);
      if (row) row.passwordHash = passwordHash;
    },
    async resetPassword(id, passwordHash) {
      const row = rows.get(id);
      if (row) {
        row.passwordHash = passwordHash;
        row.mustChangePassword = true;
      }
    },
    async clearPasswordChangeFlag(id) {
      const row = rows.get(id);
      if (row) row.mustChangePassword = false;
    },
    async setStatus(id, status) {
      const row = rows.get(id);
      if (row) row.status = status;
    },
    async setRole(id, roleId) {
      const row = rows.get(id);
      if (row) row.roleId = roleId;
    },
  };

  return { repository, rows };
}

describe('StaffService', () => {
  let staff: ReturnType<typeof createFakeStaffRepository>;
  let revokeSessions: ReturnType<typeof vi.fn>;
  let revokeSessionsExcept: ReturnType<typeof vi.fn>;
  let service: ReturnType<typeof createStaffService>;

  beforeEach(() => {
    vi.clearAllMocks();
    staff = createFakeStaffRepository();
    revokeSessions = vi.fn().mockResolvedValue(undefined);
    revokeSessionsExcept = vi.fn().mockResolvedValue(undefined);
    service = createStaffService({} as never, staff.repository, revokeSessions, revokeSessionsExcept);
  });

  it('creates a new staff member, active with a pending password change, and discloses the temporary password exactly once', async () => {
    const { account, temporaryPassword } = await service.create(
      { email: 'new@example.com', name: 'New', roleId: 'author-role-id' },
      { subjectId: 'caller-1', isOwner: false },
    );
    expect(account.status).toBe('active');
    expect(account.mustChangePassword).toBe(true);
    expect(temporaryPassword).toBeTruthy();

    const stored = staff.rows.get(account.id);
    expect(stored?.passwordHash).not.toBe(temporaryPassword);
    await expect(verifyPassword(temporaryPassword, stored!.passwordHash)).resolves.toBe(true);
  });

  it('rejects creating an account for an email that already has one, in any status', async () => {
    await staff.repository.create({
      email: 'existing@example.com',
      name: 'Existing',
      roleId: 'author-role-id',
      passwordHash: 'x',
    });
    await expect(
      service.create(
        { email: 'existing@example.com', name: 'Someone', roleId: 'author-role-id' },
        { subjectId: 'caller-1', isOwner: false },
      ),
    ).rejects.toMatchObject({ status: 409, code: 'email_exists' });
  });

  it('rejects granting the Owner role from a non-Owner caller', async () => {
    await expect(
      service.create(
        { email: 'new@example.com', name: 'New', roleId: 'owner-role-id' },
        { subjectId: 'caller-1', isOwner: false },
      ),
    ).rejects.toMatchObject({ status: 403 });
  });

  it('allows an Owner caller to grant the Owner role', async () => {
    const { account } = await service.create(
      { email: 'new-owner@example.com', name: 'New Owner', roleId: 'owner-role-id' },
      { subjectId: 'caller-1', isOwner: true },
    );
    expect(account.roleId).toBe('owner-role-id');
  });

  it('triggerReset issues a new temporary password, replaces the hash, and revokes every session', async () => {
    const created = await staff.repository.create({
      email: 'target@example.com',
      name: 'Target',
      roleId: 'author-role-id',
      passwordHash: 'original-hash',
    });

    const { temporaryPassword } = await service.triggerReset(created.id, ADMIN_CALLER);

    const updated = staff.rows.get(created.id);
    expect(updated?.mustChangePassword).toBe(true);
    await expect(verifyPassword(temporaryPassword, updated!.passwordHash)).resolves.toBe(true);
    expect(revokeSessions).toHaveBeenCalledWith('staff', created.id);
  });

  it('triggerReset re-arms the forced-change flag even when the target already cleared it', async () => {
    const created = await staff.repository.create({
      email: 'target@example.com',
      name: 'Target',
      roleId: 'author-role-id',
      passwordHash: 'original-hash',
    });
    await staff.repository.clearPasswordChangeFlag(created.id);
    expect(staff.rows.get(created.id)?.mustChangePassword).toBe(false);

    await service.triggerReset(created.id, ADMIN_CALLER);

    expect(staff.rows.get(created.id)?.mustChangePassword).toBe(true);
  });

  it('a re-issued temporary password retires the previous one', async () => {
    const created = await staff.repository.create({
      email: 'target@example.com',
      name: 'Target',
      roleId: 'author-role-id',
      passwordHash: 'original-hash',
    });
    const first = await service.triggerReset(created.id, ADMIN_CALLER);
    const second = await service.triggerReset(created.id, ADMIN_CALLER);

    const updated = staff.rows.get(created.id);
    await expect(verifyPassword(first.temporaryPassword, updated!.passwordHash)).resolves.toBe(false);
    await expect(verifyPassword(second.temporaryPassword, updated!.passwordHash)).resolves.toBe(true);
  });

  it('triggerReset rejects an unknown staff id — reset is authenticated, so a 404 is honest', async () => {
    await expect(service.triggerReset('does-not-exist', ADMIN_CALLER)).rejects.toMatchObject({
      status: 404,
      code: 'not_found',
    });
  });

  /**
   * The escalation this bar exists to close: `POST /staff/:id/reset` gates on `user.manage`
   * alone, and its 200 body carries a *working* credential for the target. Without an Owner
   * check a non-Owner Editor could reset the Owner, read the temporary password, sign in, and
   * clear the forced-change flag at `/staff/me/password` — which is deliberately exempt from
   * the pending-change gate. That makes `user.manage` a complete path to Owner
   * (design.md - "Granting Owner is Owner-only"; specs/staff-account-management/spec.md -
   * "Holding the user-management permission SHALL NOT be sufficient").
   */
  it('triggerReset refuses a non-Owner caller resetting an Owner, leaving the credential intact', async () => {
    const owner = await staff.repository.create({
      email: 'owner@example.com',
      name: 'The Owner',
      roleId: 'owner-role-id',
      passwordHash: 'owner-original-hash',
    });

    await expect(service.triggerReset(owner.id, ADMIN_CALLER)).rejects.toMatchObject({
      status: 403,
      code: 'forbidden',
    });

    // No new credential was minted, and no session of the Owner's was touched.
    expect(staff.rows.get(owner.id)?.passwordHash).toBe('owner-original-hash');
    expect(revokeSessions).not.toHaveBeenCalled();
  });

  it('triggerReset allows an Owner caller to reset another Owner', async () => {
    const owner = await staff.repository.create({
      email: 'owner@example.com',
      name: 'The Owner',
      roleId: 'owner-role-id',
      passwordHash: 'owner-original-hash',
    });

    const { temporaryPassword } = await service.triggerReset(owner.id, OWNER_CALLER);

    await expect(verifyPassword(temporaryPassword, staff.rows.get(owner.id)!.passwordHash)).resolves.toBe(true);
  });

  it('triggerReset still allows a non-Owner caller to reset an ordinary account', async () => {
    const created = await staff.repository.create({
      email: 'author@example.com',
      name: 'Author',
      roleId: 'author-role-id',
      passwordHash: 'original-hash',
    });

    const { temporaryPassword } = await service.triggerReset(created.id, ADMIN_CALLER);

    await expect(verifyPassword(temporaryPassword, staff.rows.get(created.id)!.passwordHash)).resolves.toBe(true);
  });

  it('changePassword requires the current password to verify', async () => {
    const created = await service.create(
      { email: 'self@example.com', name: 'Self', roleId: 'author-role-id' },
      { subjectId: 'caller-1', isOwner: false },
    );

    await expect(
      service.changePassword(created.account.id, 'session-1', 'wrong-current', 'a-brand-new-password'),
    ).rejects.toMatchObject({ status: 401, code: 'invalid_credentials' });

    const untouched = staff.rows.get(created.account.id);
    await expect(verifyPassword(created.temporaryPassword, untouched!.passwordHash)).resolves.toBe(true);
  });

  it('changePassword succeeds, clears the flag, and spares only the caller\'s own session', async () => {
    const created = await service.create(
      { email: 'self@example.com', name: 'Self', roleId: 'author-role-id' },
      { subjectId: 'caller-1', isOwner: false },
    );

    await service.changePassword(created.account.id, 'session-1', created.temporaryPassword, 'a-brand-new-password');

    const updated = staff.rows.get(created.account.id);
    expect(updated?.mustChangePassword).toBe(false);
    await expect(verifyPassword('a-brand-new-password', updated!.passwordHash)).resolves.toBe(true);
    expect(revokeSessionsExcept).toHaveBeenCalledWith('staff', created.account.id, 'session-1');
    expect(revokeSessions).not.toHaveBeenCalled();
  });

  it('disable revokes sessions and rejects disabling one\'s own account', async () => {
    const created = await staff.repository.create({
      email: 'target@example.com',
      name: 'Target',
      roleId: 'author-role-id',
      passwordHash: 'x',
    });
    await service.disable(created.id, { subjectId: 'caller-1', isOwner: false });
    expect(staff.rows.get(created.id)?.status).toBe('disabled');
    expect(revokeSessions).toHaveBeenCalledWith('staff', created.id);

    await expect(
      service.disable('caller-1', { subjectId: 'caller-1', isOwner: false }),
    ).rejects.toMatchObject({ status: 400, code: 'self_disable_forbidden' });
  });

  it('rejects a non-Owner disabling an Owner account, so user.manage alone cannot lock out administration', async () => {
    const owner = await staff.repository.create({
      email: 'owner@example.com',
      name: 'Owner',
      roleId: 'owner-role-id',
      passwordHash: 'x',
    });

    await expect(
      service.disable(owner.id, { subjectId: 'caller-1', isOwner: false }),
    ).rejects.toMatchObject({ status: 403, code: 'forbidden' });
    expect(staff.rows.get(owner.id)?.status).toBe('active');
    expect(revokeSessions).not.toHaveBeenCalled();
  });

  it('lets an Owner disable another Owner', async () => {
    const owner = await staff.repository.create({
      email: 'owner2@example.com',
      name: 'Second Owner',
      roleId: 'owner-role-id',
      passwordHash: 'x',
    });

    await service.disable(owner.id, { subjectId: 'caller-1', isOwner: true });

    expect(staff.rows.get(owner.id)?.status).toBe('disabled');
    expect(revokeSessions).toHaveBeenCalledWith('staff', owner.id);
  });

  it('rejects disabling an account that does not exist', async () => {
    await expect(
      service.disable('does-not-exist', { subjectId: 'caller-1', isOwner: true }),
    ).rejects.toMatchObject({ status: 404 });
  });
});
