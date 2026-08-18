import { describe, expect, it } from 'vitest';
import { toStaffAccountResponse, toStaffCreateResponse, toStaffResetResponse } from './staff.mapper.js';
import type { StaffRow } from './staff.repository.js';

function makeStaffRow(overrides: Partial<StaffRow> = {}): StaffRow {
  return {
    id: 'staff-1',
    email: 'author@example.com',
    passwordHash: 'argon2id$secret-hash',
    mustChangePassword: false,
    name: 'Author',
    roleId: 'author-role-id',
    roleName: 'Author',
    status: 'active',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

describe('toStaffAccountResponse', () => {
  // specs/staff-account-management/spec.md - "No password hash is disclosed". This is the
  // actual boundary that guarantee lives at: `StaffService.list()` returns raw `StaffRow`s
  // (which carry `passwordHash`), and every one of them is required to pass through this
  // mapper before a controller ever puts it in a response body.
  it('discloses no password hash', () => {
    const response = toStaffAccountResponse(makeStaffRow());
    expect(response).not.toHaveProperty('passwordHash');
  });

  it('carries the account fields the response schema expects', () => {
    const response = toStaffAccountResponse(makeStaffRow({ name: 'Alice' }));
    expect(response).toEqual({
      id: 'staff-1',
      email: 'author@example.com',
      name: 'Alice',
      roleId: 'author-role-id',
      roleName: 'Author',
      status: 'active',
      mustChangePassword: false,
      createdAt: '2026-01-01T00:00:00.000Z',
    });
  });
});

describe('toStaffCreateResponse', () => {
  it('extends the account response with the disclosed temporary password, still no hash', () => {
    const response = toStaffCreateResponse(makeStaffRow(), 'temp-pw-123');
    expect(response.temporaryPassword).toBe('temp-pw-123');
    expect(response).not.toHaveProperty('passwordHash');
  });
});

describe('toStaffResetResponse', () => {
  it('carries only the newly generated temporary password', () => {
    expect(toStaffResetResponse('reset-pw-456')).toEqual({ temporaryPassword: 'reset-pw-456' });
  });
});
