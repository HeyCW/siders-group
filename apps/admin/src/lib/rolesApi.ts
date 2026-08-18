import {
  permissionKeySchema,
  type PermissionKey,
  type RoleCreateRequest,
  type RoleDetailResponse,
  type RoleResponse,
  type RoleSummaryResponse,
  type RoleUpdateRequest,
} from '@siders/contracts';
import { apiFetch } from './api.js';

interface Envelope<T> {
  success: true;
  data: T;
}

/**
 * Mirrors `apps/api/src/modules/roles/role.repository.ts`'s `PermissionCatalogEntry` — not
 * re-exported via `@siders/contracts` today (`GET /roles/permissions` returns it unshaped by
 * any response schema), so this is the admin app's own copy of the shape it reads, following
 * `sessionApi.ts`'s `StaffMeResponse` precedent.
 *
 * The server itself declares `key: string` (sourced from the `text` `permissions.key` column),
 * not `PermissionKey` — narrowing it here would be an unvalidated assertion. `key` is typed
 * `PermissionKey` below only because `permissionCatalog()` validates it with
 * `permissionKeySchema` before returning, so by the time a caller sees this shape the narrowing
 * is a checked fact, not a guess.
 */
export interface PermissionCatalogEntry {
  key: PermissionKey;
  description: string;
}

export const rolesApi = {
  /** `GET /roles` — no permission set per entry; readable under the `requireAnyPermission`
   *  gate (specs/rbac-management/spec.md - "Enumerating roles"). */
  list(): Promise<RoleSummaryResponse[]> {
    return apiFetch<Envelope<RoleSummaryResponse[]>>('/roles').then((r) => r.data);
  },

  /** `GET /roles/:id` — the summary plus the role's assigned permissions, `role.manage` only. */
  detail(id: string): Promise<RoleDetailResponse> {
    return apiFetch<Envelope<RoleDetailResponse>>(`/roles/${id}`).then((r) => r.data);
  },

  permissionCatalog(): Promise<PermissionCatalogEntry[]> {
    return apiFetch<Envelope<Array<{ key: string; description: string }>>>('/roles/permissions').then((r) =>
      // The server's own type is `key: string` (see the doc comment above) — validated here so
      // that every catalog entry this app touches downstream is genuinely `PermissionKey`, not
      // an unchecked cast of one. An entry whose key isn't in the current catalog is dropped
      // rather than surfaced as a checkbox no `PermissionKey`-typed code could act on anyway.
      r.data.flatMap((entry) => {
        const key = permissionKeySchema.safeParse(entry.key);
        return key.success ? [{ key: key.data, description: entry.description }] : [];
      }),
    );
  },

  create(input: RoleCreateRequest): Promise<RoleResponse> {
    return apiFetch<Envelope<RoleResponse>>('/roles', { method: 'POST', body: input }).then((r) => r.data);
  },

  update(id: string, input: RoleUpdateRequest): Promise<RoleResponse> {
    return apiFetch<Envelope<RoleResponse>>(`/roles/${id}`, { method: 'PATCH', body: input }).then((r) => r.data);
  },

  remove(id: string): Promise<void> {
    return apiFetch<void>(`/roles/${id}`, { method: 'DELETE' });
  },

  assign(staffId: string, roleId: string): Promise<void> {
    return apiFetch<void>(`/roles/assign/${staffId}`, { method: 'POST', body: { roleId } });
  },
};
