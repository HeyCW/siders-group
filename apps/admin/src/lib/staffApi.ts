import type { StaffCreateRequest, StaffCreateResponse, StaffListItemResponse, StaffResetResponse } from '@siders/contracts';
import { apiFetch } from './api.js';

interface Envelope<T> {
  success: true;
  data: T;
}

export const staffApi = {
  /** `GET /staff` — every account, name-ordered, disabled included, no credential field
   *  (specs/staff-account-management/spec.md - "Enumerating staff accounts"). */
  list(): Promise<StaffListItemResponse[]> {
    return apiFetch<Envelope<StaffListItemResponse[]>>('/staff').then((r) => r.data);
  },

  /** The response carries the generated temporary password exactly once — never persisted or
   *  refetched (specs/staff-account-management/spec.md - "One-time disclosure of a generated
   *  temporary password"). */
  create(input: StaffCreateRequest): Promise<StaffCreateResponse> {
    return apiFetch<Envelope<StaffCreateResponse>>('/staff', { method: 'POST', body: input }).then((r) => r.data);
  },

  disable(id: string): Promise<void> {
    return apiFetch<void>(`/staff/${id}/disable`, { method: 'POST' });
  },

  /** Same one-time-disclosure rule as `create` — the newly generated temporary password. */
  reset(id: string): Promise<StaffResetResponse> {
    return apiFetch<Envelope<StaffResetResponse>>(`/staff/${id}/reset`, { method: 'POST' }).then((r) => r.data);
  },
};
