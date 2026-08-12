import type { HomeCurationEntryResponse } from '@siders/contracts';
import { apiFetch } from './api.js';

interface Envelope<T> {
  success: true;
  data: T;
}

export const curationApi = {
  list(): Promise<HomeCurationEntryResponse[]> {
    return apiFetch<Envelope<HomeCurationEntryResponse[]>>('/admin/curation').then((r) => r.data);
  },

  /** Whole-list replacement — there is no per-item reorder/add/remove endpoint. */
  replace(articleIds: string[]): Promise<HomeCurationEntryResponse[]> {
    return apiFetch<Envelope<HomeCurationEntryResponse[]>>('/admin/curation', {
      method: 'PUT',
      body: { articleIds },
    }).then((r) => r.data);
  },
};
