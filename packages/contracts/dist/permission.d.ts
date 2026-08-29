import { z } from 'zod';
export declare const PERMISSION_KEYS: readonly ["news.manage", "category.manage", "anak-usaha.manage", "media.manage", "user.manage", "role.manage", "dashboard.view", "settings.manage", "moderation.manage", "contact.manage"];
export declare const permissionKeySchema: z.ZodEnum<["news.manage", "category.manage", "anak-usaha.manage", "media.manage", "user.manage", "role.manage", "dashboard.view", "settings.manage", "moderation.manage", "contact.manage"]>;
export type PermissionKey = z.infer<typeof permissionKeySchema>;
