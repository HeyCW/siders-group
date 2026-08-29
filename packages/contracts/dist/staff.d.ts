import { z } from 'zod';
/**
 * Every staff email address enters the system through this schema, lowercased and trimmed.
 *
 * Without it `Owner@example.com` and `owner@example.com` are two distinct rows, so the
 * duplicate-email rejection in `staff.service.ts` can be walked straight past by changing the
 * case of one letter (specs/staff-account-management/spec.md - "Creating an account for an
 * email that already has one is rejected"). Normalizing here rather than in each service keeps
 * the sign-in lookup, the creation check, and the rate-limit key agreeing on what one address
 * is — they previously did not: `auth.routes.ts` already lowercased for its bucket key while
 * the repository compared raw.
 */
export declare const staffEmailSchema: z.ZodPipeline<z.ZodString, z.ZodString>;
/**
 * No `author_id`-shaped escape hatch here either: staff creation takes a `roleId`, never a
 * role name/string, and there is deliberately no field for the caller to assert their own
 * permissions or identity (see specs/rbac-management/spec.md - "Only an Owner may assign
 * the Owner role"). `.strict()` because the initial password is system-generated, never
 * caller-supplied — a `password` field in the body is a 400, not a silently ignored value
 * (specs/staff-account-management/spec.md - "Caller cannot choose the initial password").
 */
export declare const staffCreateRequestSchema: z.ZodObject<{
    email: z.ZodPipeline<z.ZodString, z.ZodString>;
    name: z.ZodString;
    roleId: z.ZodString;
}, "strict", z.ZodTypeAny, {
    name: string;
    email: string;
    roleId: string;
}, {
    name: string;
    email: string;
    roleId: string;
}>;
export type StaffCreateRequest = z.infer<typeof staffCreateRequestSchema>;
/**
 * Self-service password change (specs/staff-account-management/spec.md - "Staff may change
 * their own password"). Requires the current password so a hijacked session cannot silently
 * lock the real owner out, and doubles as the endpoint that lifts a pending forced change.
 */
export declare const staffPasswordChangeRequestSchema: z.ZodObject<{
    currentPassword: z.ZodString;
    newPassword: z.ZodString;
}, "strict", z.ZodTypeAny, {
    currentPassword: string;
    newPassword: string;
}, {
    currentPassword: string;
    newPassword: string;
}>;
export type StaffPasswordChangeRequest = z.infer<typeof staffPasswordChangeRequestSchema>;
/**
 * `GET /staff` — one entry per account, identical in shape to `staffAccountResponseSchema`
 * (id, email, name, roleId, roleName, status, mustChangePassword, createdAt) and reused rather
 * than redefined, so the two can never drift. Carries no credential field — `staff.mapper.ts`'s
 * `toStaffAccountResponse` is the only place a `StaffRow` (which carries `passwordHash`)
 * becomes a response, and every list entry goes through it
 * (specs/staff-account-management/spec.md - "Enumerating staff accounts" - "No password hash is
 * disclosed").
 */
export declare const staffListItemResponseSchema: z.ZodObject<{
    id: z.ZodString;
    email: z.ZodString;
    name: z.ZodString;
    roleId: z.ZodString;
    roleName: z.ZodString;
    status: z.ZodEnum<["active", "disabled"]>;
    mustChangePassword: z.ZodBoolean;
    createdAt: z.ZodString;
}, "strip", z.ZodTypeAny, {
    name: string;
    status: "active" | "disabled";
    id: string;
    createdAt: string;
    email: string;
    roleId: string;
    roleName: string;
    mustChangePassword: boolean;
}, {
    name: string;
    status: "active" | "disabled";
    id: string;
    createdAt: string;
    email: string;
    roleId: string;
    roleName: string;
    mustChangePassword: boolean;
}>;
export type StaffListItemResponse = z.infer<typeof staffListItemResponseSchema>;
