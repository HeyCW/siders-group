import type { PermissionKey } from '@siders/contracts';

export interface PermissionAccount {
  isOwner: boolean;
  permissionKeys: string[];
}

/**
 * True if `account` holds Owner status or any of the given permission key(s) — the one rule
 * every permission-gated rendering decision in this app shares (specs/authorization/spec.md -
 * "The Owner role satisfies every permission check"). Shared by `Sidebar.tsx` (nav visibility)
 * and `StaffPage.tsx` (per-row control visibility) so the Owner-bypass logic lives in exactly
 * one place rather than being re-derived per component.
 *
 * Rendering driven by this is cosmetic only — a 403 from the server stays authoritative
 * regardless of what this returns (specs/admin-session/spec.md - "Permission-aware rendering is
 * cosmetic, never authoritative").
 */
export function hasPermission(
  account: PermissionAccount | null,
  permission: PermissionKey | readonly PermissionKey[],
): boolean {
  if (!account) return false;
  if (account.isOwner) return true;
  const keys = Array.isArray(permission) ? permission : [permission];
  return keys.some((key) => account.permissionKeys.includes(key));
}
