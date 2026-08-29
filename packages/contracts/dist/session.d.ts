import { z } from 'zod';
/**
 * Deliberately no `accessToken`/`refreshToken`/`sid` field on either response — credentials
 * are only ever delivered as httpOnly cookies (specs/authentication/spec.md - "Session
 * credentials are only ever delivered as protected cookies"). A test asserts these schemas'
 * key sets never grow one.
 */
export declare const staffAccountResponseSchema: z.ZodObject<{
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
export type StaffAccountResponse = z.infer<typeof staffAccountResponseSchema>;
/**
 * The one deliberate exception to "no credential in a response body": creation and reset
 * each generate a temporary password server-side and must disclose it exactly once, since
 * there is no email channel to deliver it through instead (specs/staff-account-management/spec.md
 * - "Temporary passwords are generated, disclosed once, and hashed at rest"). Kept as a
 * distinct schema — extending the account response, never merging the field into it — so a
 * test can assert `temporaryPassword` appears on exactly these two schemas and nowhere else.
 */
export declare const staffCreateResponseSchema: z.ZodObject<{
    id: z.ZodString;
    email: z.ZodString;
    name: z.ZodString;
    roleId: z.ZodString;
    roleName: z.ZodString;
    status: z.ZodEnum<["active", "disabled"]>;
    mustChangePassword: z.ZodBoolean;
    createdAt: z.ZodString;
} & {
    temporaryPassword: z.ZodString;
}, "strip", z.ZodTypeAny, {
    name: string;
    status: "active" | "disabled";
    id: string;
    createdAt: string;
    email: string;
    roleId: string;
    roleName: string;
    mustChangePassword: boolean;
    temporaryPassword: string;
}, {
    name: string;
    status: "active" | "disabled";
    id: string;
    createdAt: string;
    email: string;
    roleId: string;
    roleName: string;
    mustChangePassword: boolean;
    temporaryPassword: string;
}>;
export type StaffCreateResponse = z.infer<typeof staffCreateResponseSchema>;
export declare const staffResetResponseSchema: z.ZodObject<{
    temporaryPassword: z.ZodString;
}, "strip", z.ZodTypeAny, {
    temporaryPassword: string;
}, {
    temporaryPassword: string;
}>;
export type StaffResetResponse = z.infer<typeof staffResetResponseSchema>;
export declare const readerAccountResponseSchema: z.ZodObject<{
    id: z.ZodString;
    email: z.ZodString;
    name: z.ZodString;
    avatarUrl: z.ZodNullable<z.ZodString>;
    status: z.ZodEnum<["active", "banned"]>;
    createdAt: z.ZodString;
}, "strip", z.ZodTypeAny, {
    name: string;
    status: "active" | "banned";
    id: string;
    createdAt: string;
    email: string;
    avatarUrl: string | null;
}, {
    name: string;
    status: "active" | "banned";
    id: string;
    createdAt: string;
    email: string;
    avatarUrl: string | null;
}>;
export type ReaderAccountResponse = z.infer<typeof readerAccountResponseSchema>;
