import type { GuidePickCreateRequest, GuidePickResponse, GuidePickUpdateRequest } from '@siders/contracts';
import { apiFetch } from './api.js';

interface Envelope<T> {
  success: true;
  data: T;
}

export const guidePicksApi = {
  create(input: GuidePickCreateRequest): Promise<GuidePickResponse> {
    return apiFetch<Envelope<GuidePickResponse>>('/admin/guide-picks', { method: 'POST', body: input }).then(
      (r) => r.data,
    );
  },

  list(): Promise<GuidePickResponse[]> {
    return apiFetch<Envelope<GuidePickResponse[]>>('/admin/guide-picks').then((r) => r.data);
  },

  update(id: string, input: GuidePickUpdateRequest): Promise<GuidePickResponse> {
    return apiFetch<Envelope<GuidePickResponse>>(`/admin/guide-picks/${id}`, { method: 'PATCH', body: input }).then(
      (r) => r.data,
    );
  },

  remove(id: string): Promise<void> {
    return apiFetch<void>(`/admin/guide-picks/${id}`, { method: 'DELETE' });
  },

  /** Whole-list replacement — there is no per-item reorder endpoint. */
  reorder(guidePickIds: string[]): Promise<GuidePickResponse[]> {
    return apiFetch<Envelope<GuidePickResponse[]>>('/admin/guide-picks/order', {
      method: 'PUT',
      body: { guidePickIds },
    }).then((r) => r.data);
  },
};
