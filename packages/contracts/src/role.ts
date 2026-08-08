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
export type RoleCreateRequest = z.infer<typeof roleCreateRequestSchema>;

export const roleUpdateRequestSchema = z
  .object({
    name: z.string().min(1).max(100).optional(),
    permissions: z.array(permissionKeySchema).optional(),
  })
  .strict();
export type RoleUpdateRequest = z.infer<typeof roleUpdateRequestSchema>;

export const roleAssignmentRequestSchema = z.object({
  roleId: z.string().uuid(),
});
export type RoleAssignmentRequest = z.infer<typeof roleAssignmentRequestSchema>;

export const roleResponseSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  slug: z.string(),
  isSystem: z.boolean(),
  permissions: z.array(permissionKeySchema),
});
export type RoleResponse = z.infer<typeof roleResponseSchema>;
