import { z } from 'zod';
/**
 * Deliberately no `accessToken`/`refreshToken`/`sid` field on either response — credentials
 * are only ever delivered as httpOnly cookies (specs/authentication/spec.md - "Session
 * credentials are only ever delivered as protected cookies"). A test asserts these schemas'
 * key sets never grow one.
 */
export const staffAccountResponseSchema = z.object({
    id: z.string().uuid(),
    email: z.string().email(),
    name: z.string(),
    roleId: z.string().uuid(),
    roleName: z.string(),
    status: z.enum(['active', 'disabled']),
    mustChangePassword: z.boolean(),
    createdAt: z.string(),
});
/**
 * The one deliberate exception to "no credential in a response body": creation and reset
 * each generate a temporary password server-side and must disclose it exactly once, since
 * there is no email channel to deliver it through instead (specs/staff-account-management/spec.md
 * - "Temporary passwords are generated, disclosed once, and hashed at rest"). Kept as a
 * distinct schema — extending the account response, never merging the field into it — so a
 * test can assert `temporaryPassword` appears on exactly these two schemas and nowhere else.
 */
export const staffCreateResponseSchema = staffAccountResponseSchema.extend({
    temporaryPassword: z.string(),
});
export const staffResetResponseSchema = z.object({
    temporaryPassword: z.string(),
});
export const readerAccountResponseSchema = z.object({
    id: z.string().uuid(),
    email: z.string().email(),
    name: z.string(),
    avatarUrl: z.string().url().nullable(),
    status: z.enum(['active', 'banned']),
    createdAt: z.string(),
});
