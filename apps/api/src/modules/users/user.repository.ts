import type { StaffUserRow } from './user.mapper.js';

/** Drizzle queries only — no Express types here. Implemented by the auth/users follow-up change. */
export interface UserRepository {
  findById(id: string): Promise<StaffUserRow | null>;
}

export function createUserRepository(): UserRepository {
  return {
    findById() {
      throw new Error('UserRepository not yet implemented (see the auth/users follow-up change)');
    },
  };
}
