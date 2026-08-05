import type { UserRepository } from './user.repository.js';
import type { StaffUserDto } from './user.mapper.js';
import { toStaffUserDto } from './user.mapper.js';

/** Rules, permissions, orchestration — never imports Drizzle directly. */
export interface UserService {
  getById(id: string): Promise<StaffUserDto | null>;
}

export function createUserService(repository: UserRepository): UserService {
  return {
    async getById(id) {
      const row = await repository.findById(id);
      return row ? toStaffUserDto(row) : null;
    },
  };
}
