import { z } from 'zod';

export const PERMISSION_KEYS = [
  'news.manage',
  'category.manage',
  'tag.manage',
  'media.manage',
  'user.manage',
  'role.manage',
  'dashboard.view',
  'settings.manage',
] as const;

export const permissionKeySchema = z.enum(PERMISSION_KEYS);

export type PermissionKey = z.infer<typeof permissionKeySchema>;
