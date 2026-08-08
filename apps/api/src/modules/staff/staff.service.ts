import type { Database } from '@siders/db';
import { AppError } from '../../middleware/errorHandler.js';
import { generateTemporaryPassword, hashPassword, verifyPassword } from '../../lib/password.js';
import { getOwnerRoleId } from '../../lib/ownerRole.js';
import type { CallerContext } from '../../lib/callerContext.js';
import type { StaffRepository, StaffRow } from './staff.repository.js';

export type RevokeStaffSessions = (subjectType: 'staff', subjectId: string) => Promise<void>;
export type RevokeStaffSessionsExcept = (
  subjectType: 'staff',
  subjectId: string,
  exceptSessionId: string,
) => Promise<void>;

export interface CreatedStaff {
  account: StaffRow;
  /** Disclosed exactly once, here — never re-readable afterward. */
  temporaryPassword: string;
}

export interface StaffService {
  create(input: { email: string; name: string; roleId: string }, caller: CallerContext): Promise<CreatedStaff>;
  disable(targetId: string, caller: CallerContext): Promise<void>;
  triggerReset(targetId: string): Promise<{ temporaryPassword: string }>;
  changePassword(
    subjectId: string,
    sessionId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void>;
}

export function createStaffService(
  db: Database,
  staffRepository: StaffRepository,
  revokeSessions: RevokeStaffSessions,
  revokeSessionsExcept: RevokeStaffSessionsExcept,
): StaffService {
  return {
    async create(input, caller) {
      // Rejects an email that already belongs to any staff account in any status — an
      // upsert here would let a user.manage holder take over an existing (e.g. Owner)
      // account by re-creating its address (specs/staff-account-management/spec.md -
      // "Creating an account for an email that already has one is rejected").
      const existing = await staffRepository.findByEmail(input.email);
      if (existing) {
        throw new AppError('An account with this email already exists', 409, 'email_exists');
      }

      const ownerRoleId = await getOwnerRoleId(db);
      if (input.roleId === ownerRoleId && !caller.isOwner) {
        throw new AppError('Only an Owner may grant the Owner role', 403, 'forbidden');
      }

      const temporaryPassword = generateTemporaryPassword();
      const passwordHash = await hashPassword(temporaryPassword);
      const account = await staffRepository.create({ ...input, passwordHash });
      return { account, temporaryPassword };
    },

    async disable(targetId, caller) {
      if (targetId === caller.subjectId) {
        throw new AppError('You cannot disable your own account', 400, 'self_disable_forbidden');
      }
      const target = await staffRepository.findById(targetId);
      if (!target) {
        throw new AppError('Staff member not found', 404, 'not_found');
      }
      // Disabling an Owner is Owner-only, for the same reason granting Owner is: otherwise
      // `user.manage` alone could disable every Owner and leave role administration
      // permanently unreachable (design.md - "Granting Owner is Owner-only"). Combined with
      // the self-disable bar above, at least one active Owner always survives — the caller.
      if (target.roleId === (await getOwnerRoleId(db)) && !caller.isOwner) {
        throw new AppError('Only an Owner may disable an Owner account', 403, 'forbidden');
      }
      await staffRepository.setStatus(targetId, 'disabled');
      await revokeSessions('staff', targetId);
    },

    async triggerReset(targetId) {
      // Reset is authenticated (user.manage) now that there is no unauthenticated path, so a
      // missing id is an honest 404 rather than the identical-response enumeration guard the
      // old unauthenticated reset needed (specs/staff-account-management/spec.md - "Credential
      // reset").
      const staff = await staffRepository.findById(targetId);
      if (!staff) {
        throw new AppError('Staff member not found', 404, 'not_found');
      }
      const temporaryPassword = generateTemporaryPassword();
      const passwordHash = await hashPassword(temporaryPassword);
      await staffRepository.resetPassword(targetId, passwordHash);
      // Admin-triggered: the staff member isn't the one making this request, so every one of
      // their sessions dies — a reset that leaves the attacker's session alive is not a
      // remediation.
      await revokeSessions('staff', targetId);
      return { temporaryPassword };
    },

    async changePassword(subjectId, sessionId, currentPassword, newPassword) {
      const staff = await staffRepository.findById(subjectId);
      if (!staff) {
        throw new AppError('Staff member not found', 404, 'not_found');
      }
      const currentMatches = await verifyPassword(currentPassword, staff.passwordHash);
      if (!currentMatches) {
        throw new AppError('Current password is incorrect', 401, 'invalid_credentials');
      }
      const passwordHash = await hashPassword(newPassword);
      await staffRepository.setPassword(subjectId, passwordHash);
      await staffRepository.clearPasswordChangeFlag(subjectId);
      // Self-service: spare the caller's own session so changing a password doesn't sign the
      // caller out of the request that changed it (specs/staff-account-management/spec.md -
      // "Changing a password ends the account's other sessions").
      await revokeSessionsExcept('staff', subjectId, sessionId);
    },
  };
}
