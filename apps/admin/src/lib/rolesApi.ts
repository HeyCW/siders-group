import type {
  PermissionKey,
  RoleCreateRequest,
  RoleDetailResponse,
  RoleResponse,
  RoleSummaryResponse,
  RoleUpdateRequest,
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
    return apiFetch<Envelope<PermissionCatalogEntry[]>>('/roles/permissions').then((r) => r.data);
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
