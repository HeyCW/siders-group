import type { StaffAccountResponse, StaffCreateResponse, StaffResetResponse } from '@siders/contracts';
import type { StaffRow } from './staff.repository.js';

/** Never let a raw row (e.g. `password_hash`) reach the client — always through this mapper. */
export function toStaffAccountResponse(row: StaffRow): StaffAccountResponse {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    roleId: row.roleId,
    roleName: row.roleName,
    status: row.status,
    mustChangePassword: row.mustChangePassword,
    createdAt: row.createdAt.toISOString(),
  };
}

/** The one response that also carries a plaintext credential — disclosed exactly once. */
export function toStaffCreateResponse(row: StaffRow, temporaryPassword: string): StaffCreateResponse {
  return { ...toStaffAccountResponse(row), temporaryPassword };
}

export function toStaffResetResponse(temporaryPassword: string): StaffResetResponse {
  return { temporaryPassword };
}
