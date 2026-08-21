import type {
  AnakUsahaAdminResponse,
  AnakUsahaProfileCreateRequest,
  AnakUsahaProfileUpdateRequest,
} from '@siders/contracts';
import { apiFetch } from './api.js';

interface Envelope<T> {
  success: true;
  data: T;
}

/**
 * The admin presentation screen's client — separate from `taxonomyApi.ts`'s `anakUsahaApi`,
 * which stays scoped to the plain `{id, name, slug}` CRUD (design.md - "Separate
 * anak_usaha_profile table, not new columns on anak_usaha"). `list()` hits the admin-only
 * `/anak-usaha/admin` listing, not the public `/anak-usaha` one, so inactive profiles' fields are
 * visible for editing.
 */
export const anakUsahaPresentationApi = {
  list(): Promise<AnakUsahaAdminResponse[]> {
    return apiFetch<Envelope<AnakUsahaAdminResponse[]>>('/anak-usaha/admin').then((r) => r.data);
  },

  createProfile(anakUsahaId: string, input: AnakUsahaProfileCreateRequest): Promise<AnakUsahaAdminResponse> {
    return apiFetch<Envelope<AnakUsahaAdminResponse>>(`/anak-usaha/${anakUsahaId}/profile`, {
      method: 'POST',
      body: input,
    }).then((r) => r.data);
  },

  updateProfile(anakUsahaId: string, input: AnakUsahaProfileUpdateRequest): Promise<AnakUsahaAdminResponse> {
    return apiFetch<Envelope<AnakUsahaAdminResponse>>(`/anak-usaha/${anakUsahaId}/profile`, {
      method: 'PATCH',
      body: input,
    }).then((r) => r.data);
  },

  removeProfile(anakUsahaId: string): Promise<void> {
    return apiFetch<void>(`/anak-usaha/${anakUsahaId}/profile`, { method: 'DELETE' });
  },

  /** Whole-list replacement — there is no per-item reorder endpoint, mirrors `partnersApi.reorder`. */
  reorderProfiles(anakUsahaIds: string[]): Promise<AnakUsahaAdminResponse[]> {
    return apiFetch<Envelope<AnakUsahaAdminResponse[]>>('/anak-usaha/profile/order', {
      method: 'PUT',
      body: { anakUsahaIds },
    }).then((r) => r.data);
  },
};
