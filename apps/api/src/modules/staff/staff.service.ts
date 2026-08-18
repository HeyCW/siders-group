import type { Database } from '@siders/db';
import type { StaffAccountResponse } from '@siders/contracts';
import { AppError } from '../../middleware/errorHandler.js';
import { generateTemporaryPassword, hashPassword, verifyPassword } from '../../lib/password.js';
import { getOwnerRoleId } from '../../lib/ownerRole.js';
import type { CallerContext } from '../../lib/callerContext.js';
import type { StaffRepository, StaffRow } from './staff.repository.js';
import { toStaffAccountResponse } from './staff.mapper.js';

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
  /** Mapped through `toStaffAccountResponse` here, not left to the controller — `StaffRow`
   *  carries `passwordHash` from `SELECT_COLUMNS`, and this is the one boundary that must never
   *  let a raw row escape (design.md - "Password hash leakage"). */
  list(): Promise<StaffAccountResponse[]>;
  create(input: { email: string; name: string; roleId: string }, caller: CallerContext): Promise<CreatedStaff>;
  disable(targetId: string, caller: CallerContext): Promise<void>;
  triggerReset(targetId: string, caller: CallerContext): Promise<{ temporaryPassword: string }>;
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
  /**
   * The Owner-only bar every privileged staff operation shares: `user.manage` lets a caller
   * administer ordinary accounts, but touching an Owner — granting the role, disabling one, or
   * resetting one's credentials — additionally requires already holding it. Without this,
   * `user.manage` is a complete path to Owner (design.md - "Granting Owner is Owner-only").
   *
   * One function owns the rule so a new privileged operation inherits it by calling this rather
   * than by remembering to re-derive it; `triggerReset` shipped without the check precisely
   * because it was open-coded in the other two.
   */
  async function assertMayActOnOwner(targetRoleId: string, caller: CallerContext, action: string): Promise<void> {
    if (targetRoleId !== (await getOwnerRoleId(db))) return;
    if (caller.isOwner) return;
    throw new AppError(`Only an Owner may ${action} an Owner account`, 403, 'forbidden');
  }

  return {
    async list() {
      const rows = await staffRepository.list();
      return rows.map(toStaffAccountResponse);
    },

    async create(input, caller) {
      // Rejects an email that already belongs to any staff account in any status — an
      // upsert here would let a user.manage holder take over an existing (e.g. Owner)
      // account by re-creating its address (specs/staff-account-management/spec.md -
      // "Creating an account for an email that already has one is rejected").
      const existing = await staffRepository.findByEmail(input.email);
      if (existing) {
        throw new AppError('An account with this email already exists', 409, 'email_exists');
      }

      if (input.roleId === (await getOwnerRoleId(db)) && !caller.isOwner) {
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
      // Combined with the self-disable bar above, at least one active Owner always survives —
      // the caller.
      await assertMayActOnOwner(target.roleId, caller, 'disable');
      await staffRepository.setStatus(targetId, 'disabled');
      await revokeSessions('staff', targetId);
    },

    async triggerReset(targetId, caller) {
      // Reset is authenticated (user.manage) now that there is no unauthenticated path, so a
      // missing id is an honest 404 rather than the identical-response enumeration guard the
      // old unauthenticated reset needed (specs/staff-account-management/spec.md - "Credential
      // reset").
      const staff = await staffRepository.findById(targetId);
      if (!staff) {
        throw new AppError('Staff member not found', 404, 'not_found');
      }
      // Reset is the most powerful of the three Owner-protected operations: it hands the caller
      // a *working* credential for the target account in the response body, so a non-Owner
      // holding `user.manage` could otherwise reset an Owner, read the temporary password, sign
      // in as them, and clear the forced-change flag at `/staff/me/password` — which is exempt
      // from the pending-change gate precisely so it stays reachable.
      await assertMayActOnOwner(staff.roleId, caller, 'reset');
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
      // `setPassword` clears the forced-change flag in the same statement.
      await staffRepository.setPassword(subjectId, passwordHash);
      // Self-service: spare the caller's own session so changing a password doesn't sign the
      // caller out of the request that changed it (specs/staff-account-management/spec.md -
      // "Changing a password ends the account's other sessions").
      await revokeSessionsExcept('staff', subjectId, sessionId);
    },
  };
}
