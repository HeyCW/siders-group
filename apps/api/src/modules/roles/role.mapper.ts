import type { RoleResponse } from '@siders/contracts';
import type { RoleWithPermissions } from './role.repository.js';

export function toRoleResponse(row: RoleWithPermissions): RoleResponse {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    isSystem: row.isSystem,
    permissions: row.permissions as RoleResponse['permissions'],
  };
}
