export interface StaffUserRow {
  id: string;
  email: string;
  name: string;
  role: 'owner' | 'editor' | 'author';
  status: 'invited' | 'active' | 'disabled';
  createdAt: Date;
}

export interface StaffUserDto {
  id: string;
  email: string;
  name: string;
  role: StaffUserRow['role'];
  status: StaffUserRow['status'];
  createdAt: string;
}

/** Never let a raw row (e.g. password_hash) reach the client — always through this mapper. */
export function toStaffUserDto(row: StaffUserRow): StaffUserDto {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
  };
}
