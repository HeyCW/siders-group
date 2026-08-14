export interface StaffUserRow {
  id: string;
  email: string;
  name: string;
  roleId: string;
  roleName: string;
  status: 'active' | 'disabled';
  mustChangePassword: boolean;
  createdAt: Date;
  /** Sourced from `req.staffRole` (`resolveStaffAccess`), never a second, redundant query —
   *  see `user.service.ts`. Rendering-only; never a grant (specs/authorization/spec.md -
   *  "A staff member's own effective permissions and Owner status are readable"). */
  permissionKeys: string[];
  isOwner: boolean;
}

export interface StaffUserDto {
  id: string;
  email: string;
  name: string;
  roleId: string;
  roleName: string;
  status: StaffUserRow['status'];
  mustChangePassword: boolean;
  createdAt: string;
  permissionKeys: string[];
  isOwner: boolean;
}

/** Never let a raw row (e.g. `password_hash`) reach the client — always through this mapper. */
export function toStaffUserDto(row: StaffUserRow): StaffUserDto {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    roleId: row.roleId,
    roleName: row.roleName,
    status: row.status,
    mustChangePassword: row.mustChangePassword,
    createdAt: row.createdAt.toISOString(),
    permissionKeys: row.permissionKeys,
    isOwner: row.isOwner,
  };
}
