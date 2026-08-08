import { z } from 'zod';

/**
 * No `author_id`-shaped escape hatch here either: staff creation takes a `roleId`, never a
 * role name/string, and there is deliberately no field for the caller to assert their own
 * permissions or identity (see specs/rbac-management/spec.md - "Only an Owner may assign
 * the Owner role"). `.strict()` because the initial password is system-generated, never
 * caller-supplied — a `password` field in the body is a 400, not a silently ignored value
 * (specs/staff-account-management/spec.md - "Caller cannot choose the initial password").
 */
export const staffCreateRequestSchema = z
  .object({
    email: z.string().email(),
    name: z.string().min(1).max(200),
    roleId: z.string().uuid(),
  })
  .strict();
export type StaffCreateRequest = z.infer<typeof staffCreateRequestSchema>;

/**
 * Self-service password change (specs/staff-account-management/spec.md - "Staff may change
 * their own password"). Requires the current password so a hijacked session cannot silently
 * lock the real owner out, and doubles as the endpoint that lifts a pending forced change.
 */
export const staffPasswordChangeRequestSchema = z
  .object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(8),
  })
  .strict();
export type StaffPasswordChangeRequest = z.infer<typeof staffPasswordChangeRequestSchema>;
