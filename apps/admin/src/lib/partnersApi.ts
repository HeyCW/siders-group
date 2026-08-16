import type { PartnerCreateRequest, PartnerResponse, PartnerUpdateRequest } from '@siders/contracts';
import { apiFetch } from './api.js';

interface Envelope<T> {
  success: true;
  data: T;
}

export const partnersApi = {
  create(input: PartnerCreateRequest): Promise<PartnerResponse> {
    return apiFetch<Envelope<PartnerResponse>>('/admin/partners', { method: 'POST', body: input }).then((r) => r.data);
  },

  list(): Promise<PartnerResponse[]> {
    return apiFetch<Envelope<PartnerResponse[]>>('/admin/partners').then((r) => r.data);
  },

  update(id: string, input: PartnerUpdateRequest): Promise<PartnerResponse> {
    return apiFetch<Envelope<PartnerResponse>>(`/admin/partners/${id}`, { method: 'PATCH', body: input }).then(
      (r) => r.data,
    );
  },

  remove(id: string): Promise<void> {
    return apiFetch<void>(`/admin/partners/${id}`, { method: 'DELETE' });
  },

  /** Whole-list replacement — there is no per-item reorder endpoint. */
  reorder(partnerIds: string[]): Promise<PartnerResponse[]> {
    return apiFetch<Envelope<PartnerResponse[]>>('/admin/partners/order', {
      method: 'PUT',
      body: { partnerIds },
    }).then((r) => r.data);
  },
};
