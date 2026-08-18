import type { RoleDetailResponse, RoleResponse, RoleSummaryResponse } from '@siders/contracts';
import type { RoleDetail, RoleSummaryRow, RoleWithPermissions } from './role.repository.js';

export function toRoleResponse(row: RoleWithPermissions): RoleResponse {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    isSystem: row.isSystem,
    permissions: row.permissions as RoleResponse['permissions'],
  };
}

export function toRoleSummaryResponse(row: RoleSummaryRow): RoleSummaryResponse {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    isSystem: row.isSystem,
    holderCount: row.holderCount,
  };
}

export function toRoleDetailResponse(row: RoleDetail): RoleDetailResponse {
  return { ...toRoleResponse(row), holderCount: row.holderCount };
}
