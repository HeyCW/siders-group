import type { ReelCreateRequest, ReelResponse, ReelUpdateRequest, ReelsCurationEntryResponse } from '@siders/contracts';
import { apiFetch } from './api.js';

interface Envelope<T> {
  success: true;
  data: T;
}

export const reelsApi = {
  create(input: ReelCreateRequest): Promise<ReelResponse> {
    return apiFetch<Envelope<ReelResponse>>('/admin/reels', { method: 'POST', body: input }).then((r) => r.data);
  },

  list(): Promise<ReelResponse[]> {
    return apiFetch<Envelope<ReelResponse[]>>('/admin/reels').then((r) => r.data);
  },

  update(id: string, input: ReelUpdateRequest): Promise<ReelResponse> {
    return apiFetch<Envelope<ReelResponse>>(`/admin/reels/${id}`, { method: 'PATCH', body: input }).then((r) => r.data);
  },

  remove(id: string): Promise<void> {
    return apiFetch<void>(`/admin/reels/${id}`, { method: 'DELETE' });
  },
};

export const reelsCurationApi = {
  list(): Promise<ReelsCurationEntryResponse[]> {
    return apiFetch<Envelope<ReelsCurationEntryResponse[]>>('/admin/reels-curation').then((r) => r.data);
  },

  /** Whole-list replacement — there is no per-item reorder/add/remove endpoint. */
  replace(reelIds: string[]): Promise<ReelsCurationEntryResponse[]> {
    return apiFetch<Envelope<ReelsCurationEntryResponse[]>>('/admin/reels-curation', {
      method: 'PUT',
      body: { reelIds },
    }).then((r) => r.data);
  },
};
