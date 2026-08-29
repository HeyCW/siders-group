import { z } from 'zod';
import { permissionKeySchema } from './permission.js';
// .strict() rejects an unexpected `isSystem`/`slug` field outright rather than silently
// dropping it — a system-role marker is never settable from a request payload
// (specs/rbac-management/spec.md - "System-role marker cannot be set through a request").
export const roleCreateRequestSchema = z
    .object({
    name: z.string().min(1).max(100),
    permissions: z.array(permissionKeySchema),
})
    .strict();
export const roleUpdateRequestSchema = z
    .object({
    name: z.string().min(1).max(100).optional(),
    permissions: z.array(permissionKeySchema).optional(),
})
    .strict();
export const roleAssignmentRequestSchema = z.object({
    roleId: z.string().uuid(),
});
export const roleResponseSchema = z.object({
    id: z.string().uuid(),
    name: z.string(),
    slug: z.string(),
    isSystem: z.boolean(),
    permissions: z.array(permissionKeySchema),
});
/**
 * `GET /roles` — no `permissions` field, so this stays readable under the `requireAnyPermission
 * ('user.manage', 'role.manage')` gate without disclosing role-administration data to a
 * `user.manage`-only caller (specs/rbac-management/spec.md - "Enumerating roles").
 * `holderCount` is a computed aggregate, never a stored column.
 */
export const roleSummaryResponseSchema = z.object({
    id: z.string().uuid(),
    name: z.string(),
    slug: z.string(),
    isSystem: z.boolean(),
    holderCount: z.number().int().nonnegative(),
});
/**
 * `GET /roles/:id` — the summary plus the role's assigned permissions, gated on `role.manage`
 * alone since a permission set is role-administration data
 * (specs/rbac-management/spec.md - "Reading one role's permissions").
 */
export const roleDetailResponseSchema = roleSummaryResponseSchema.extend({
    permissions: z.array(permissionKeySchema),
});
