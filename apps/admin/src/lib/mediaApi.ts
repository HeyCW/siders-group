import type { MediaContext, MediaResponse } from '@siders/contracts';
import { apiFetch, apiUpload } from './api.js';

interface Envelope<T> {
  success: true;
  data: T;
}

export const mediaApi = {
  upload(file: File, metadata: { alt?: string; caption?: string; context?: MediaContext } = {}): Promise<MediaResponse> {
    const formData = new FormData();
    formData.append('file', file);
    if (metadata.alt) formData.append('alt', metadata.alt);
    if (metadata.caption) formData.append('caption', metadata.caption);
    if (metadata.context) formData.append('context', metadata.context);
    return apiUpload<Envelope<MediaResponse>>('/media', formData).then((r) => r.data);
  },

  get(id: string): Promise<MediaResponse> {
    return apiFetch<Envelope<MediaResponse>>(`/media/${id}`).then((r) => r.data);
  },

  remove(id: string): Promise<void> {
    return apiFetch<void>(`/media/${id}`, { method: 'DELETE' });
  },
};
