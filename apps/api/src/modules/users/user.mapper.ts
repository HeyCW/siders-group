export interface StaffUserRow {
  id: string;
  email: string;
  name: string;
  roleId: string;
  roleName: string;
  status: 'active' | 'disabled';
  mustChangePassword: boolean;
  createdAt: Date;
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
  };
}
