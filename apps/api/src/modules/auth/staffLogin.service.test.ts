import { describe, expect, it, vi } from 'vitest';
import { createStaffLoginService } from './staffLogin.service.js';
import { hashPassword } from '../../lib/password.js';
import type { StaffRow } from '../staff/staff.repository.js';

async function makeStaff(overrides: Partial<StaffRow> = {}): Promise<StaffRow> {
  return {
    id: 'staff-1',
    email: 'owner@example.com',
    passwordHash: await hashPassword('correct-password'),
    mustChangePassword: false,
    name: 'Owner',
    roleId: 'role-1',
    roleName: 'Owner',
    status: 'active',
    createdAt: new Date(),
    ...overrides,
  };
}

function repositoryReturning(staff: StaffRow | null) {
  return { findByEmail: vi.fn().mockResolvedValue(staff) };
}

describe('StaffLoginService', () => {
  it('succeeds for an active account with the correct password', async () => {
    const staff = await makeStaff();
    const service = createStaffLoginService(repositoryReturning(staff));
    await expect(service.login('owner@example.com', 'correct-password')).resolves.toEqual({
      subjectId: 'staff-1',
    });
  });

  it('rejects an unknown email with the generic failure', async () => {
    const service = createStaffLoginService(repositoryReturning(null));
    await expect(service.login('nobody@example.com', 'anything')).rejects.toMatchObject({
      status: 401,
      code: 'invalid_credentials',
    });
  });

  it('rejects the correct password for a disabled account with the same generic failure', async () => {
    const staff = await makeStaff({ status: 'disabled' });
    const service = createStaffLoginService(repositoryReturning(staff));
    await expect(service.login('owner@example.com', 'correct-password')).rejects.toMatchObject({
      status: 401,
      code: 'invalid_credentials',
    });
  });

  it('signs in with a temporary password while a change is pending — the guard blocks routes, not sign-in', async () => {
    const staff = await makeStaff({ mustChangePassword: true });
    const service = createStaffLoginService(repositoryReturning(staff));
    await expect(service.login('owner@example.com', 'correct-password')).resolves.toEqual({
      subjectId: 'staff-1',
    });
  });

  it('rejects a wrong password for an active account with the same generic failure', async () => {
    const staff = await makeStaff();
    const service = createStaffLoginService(repositoryReturning(staff));
    await expect(service.login('owner@example.com', 'wrong-password')).rejects.toMatchObject({
      status: 401,
      code: 'invalid_credentials',
    });
  });

  it('performs equivalent Argon2id work whether or not the account exists', async () => {
    const staff = await makeStaff();
    const withAccount = createStaffLoginService(repositoryReturning(staff));
    const withoutAccount = createStaffLoginService(repositoryReturning(null));

    const start1 = performance.now();
    await withAccount.login('owner@example.com', 'wrong-password').catch(() => undefined);
    const elapsedWithAccount = performance.now() - start1;

    const start2 = performance.now();
    await withoutAccount.login('nobody@example.com', 'wrong-password').catch(() => undefined);
    const elapsedWithoutAccount = performance.now() - start2;

    // Both paths run one real Argon2id hash — same OWASP-baseline cost — so neither should
    // be dramatically cheaper than the other. A generous bound avoids CI flakiness while
    // still catching an accidental early-return-before-hashing regression.
    expect(elapsedWithoutAccount).toBeGreaterThan(elapsedWithAccount * 0.4);
  });
});
