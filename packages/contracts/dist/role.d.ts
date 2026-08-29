import { z } from 'zod';
export declare const roleCreateRequestSchema: z.ZodObject<{
    name: z.ZodString;
    permissions: z.ZodArray<z.ZodEnum<["news.manage", "category.manage", "anak-usaha.manage", "media.manage", "user.manage", "role.manage", "dashboard.view", "settings.manage", "moderation.manage", "contact.manage"]>, "many">;
}, "strict", z.ZodTypeAny, {
    name: string;
    permissions: ("news.manage" | "category.manage" | "anak-usaha.manage" | "media.manage" | "user.manage" | "role.manage" | "dashboard.view" | "settings.manage" | "moderation.manage" | "contact.manage")[];
}, {
    name: string;
    permissions: ("news.manage" | "category.manage" | "anak-usaha.manage" | "media.manage" | "user.manage" | "role.manage" | "dashboard.view" | "settings.manage" | "moderation.manage" | "contact.manage")[];
}>;
export type RoleCreateRequest = z.infer<typeof roleCreateRequestSchema>;
export declare const roleUpdateRequestSchema: z.ZodObject<{
    name: z.ZodOptional<z.ZodString>;
    permissions: z.ZodOptional<z.ZodArray<z.ZodEnum<["news.manage", "category.manage", "anak-usaha.manage", "media.manage", "user.manage", "role.manage", "dashboard.view", "settings.manage", "moderation.manage", "contact.manage"]>, "many">>;
}, "strict", z.ZodTypeAny, {
    name?: string | undefined;
    permissions?: ("news.manage" | "category.manage" | "anak-usaha.manage" | "media.manage" | "user.manage" | "role.manage" | "dashboard.view" | "settings.manage" | "moderation.manage" | "contact.manage")[] | undefined;
}, {
    name?: string | undefined;
    permissions?: ("news.manage" | "category.manage" | "anak-usaha.manage" | "media.manage" | "user.manage" | "role.manage" | "dashboard.view" | "settings.manage" | "moderation.manage" | "contact.manage")[] | undefined;
}>;
export type RoleUpdateRequest = z.infer<typeof roleUpdateRequestSchema>;
export declare const roleAssignmentRequestSchema: z.ZodObject<{
    roleId: z.ZodString;
}, "strip", z.ZodTypeAny, {
    roleId: string;
}, {
    roleId: string;
}>;
export type RoleAssignmentRequest = z.infer<typeof roleAssignmentRequestSchema>;
export declare const roleResponseSchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    slug: z.ZodString;
    isSystem: z.ZodBoolean;
    permissions: z.ZodArray<z.ZodEnum<["news.manage", "category.manage", "anak-usaha.manage", "media.manage", "user.manage", "role.manage", "dashboard.view", "settings.manage", "moderation.manage", "contact.manage"]>, "many">;
}, "strip", z.ZodTypeAny, {
    name: string;
    id: string;
    slug: string;
    permissions: ("news.manage" | "category.manage" | "anak-usaha.manage" | "media.manage" | "user.manage" | "role.manage" | "dashboard.view" | "settings.manage" | "moderation.manage" | "contact.manage")[];
    isSystem: boolean;
}, {
    name: string;
    id: string;
    slug: string;
    permissions: ("news.manage" | "category.manage" | "anak-usaha.manage" | "media.manage" | "user.manage" | "role.manage" | "dashboard.view" | "settings.manage" | "moderation.manage" | "contact.manage")[];
    isSystem: boolean;
}>;
export type RoleResponse = z.infer<typeof roleResponseSchema>;
/**
 * `GET /roles` — no `permissions` field, so this stays readable under the `requireAnyPermission
 * ('user.manage', 'role.manage')` gate without disclosing role-administration data to a
 * `user.manage`-only caller (specs/rbac-management/spec.md - "Enumerating roles").
 * `holderCount` is a computed aggregate, never a stored column.
 */
export declare const roleSummaryResponseSchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    slug: z.ZodString;
    isSystem: z.ZodBoolean;
    holderCount: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    name: string;
    id: string;
    slug: string;
    isSystem: boolean;
    holderCount: number;
}, {
    name: string;
    id: string;
    slug: string;
    isSystem: boolean;
    holderCount: number;
}>;
export type RoleSummaryResponse = z.infer<typeof roleSummaryResponseSchema>;
/**
 * `GET /roles/:id` — the summary plus the role's assigned permissions, gated on `role.manage`
 * alone since a permission set is role-administration data
 * (specs/rbac-management/spec.md - "Reading one role's permissions").
 */
export declare const roleDetailResponseSchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    slug: z.ZodString;
    isSystem: z.ZodBoolean;
    holderCount: z.ZodNumber;
} & {
    permissions: z.ZodArray<z.ZodEnum<["news.manage", "category.manage", "anak-usaha.manage", "media.manage", "user.manage", "role.manage", "dashboard.view", "settings.manage", "moderation.manage", "contact.manage"]>, "many">;
}, "strip", z.ZodTypeAny, {
    name: string;
    id: string;
    slug: string;
    permissions: ("news.manage" | "category.manage" | "anak-usaha.manage" | "media.manage" | "user.manage" | "role.manage" | "dashboard.view" | "settings.manage" | "moderation.manage" | "contact.manage")[];
    isSystem: boolean;
    holderCount: number;
}, {
    name: string;
    id: string;
    slug: string;
    permissions: ("news.manage" | "category.manage" | "anak-usaha.manage" | "media.manage" | "user.manage" | "role.manage" | "dashboard.view" | "settings.manage" | "moderation.manage" | "contact.manage")[];
    isSystem: boolean;
    holderCount: number;
}>;
export type RoleDetailResponse = z.infer<typeof roleDetailResponseSchema>;
