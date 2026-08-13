import type { UserRepository } from './user.repository.js';
import type { StaffUserDto } from './user.mapper.js';
import { toStaffUserDto } from './user.mapper.js';

/** The caller's own effective access, resolved once by `resolveStaffAccess` and carried on
 *  `req.staffRole` — passed in rather than re-derived here (design.md - "not a second query"). */
export interface StaffAccessInfo {
  permissionKeys: string[];
  isOwner: boolean;
}

/** Rules, permissions, orchestration — never imports Drizzle directly. */
export interface UserService {
  getById(id: string, access: StaffAccessInfo): Promise<StaffUserDto | null>;
}

export function createUserService(repository: UserRepository): UserService {
  return {
    async getById(id, access) {
      const row = await repository.findById(id);
      return row ? toStaffUserDto({ ...row, ...access }) : null;
    },
  };
}
