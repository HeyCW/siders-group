import type {
  ArticleAdminResponse,
  ArticleAutosaveRequest,
  ArticleCreateRequest,
  ArticlePublicDetail,
  ArticleScheduleRequest,
  ArticleStatus,
  ArticleUpdateRequest,
} from '@siders/contracts';
import { apiFetch } from './api.js';

interface Envelope<T> {
  success: true;
  data: T;
}

export const articlesApi = {
  list(status?: ArticleStatus): Promise<ArticleAdminResponse[]> {
    const query = status ? `?status=${status}` : '';
    return apiFetch<Envelope<ArticleAdminResponse[]>>(`/admin/articles${query}`).then((r) => r.data);
  },

  get(id: string): Promise<ArticleAdminResponse> {
    return apiFetch<Envelope<ArticleAdminResponse>>(`/admin/articles/${id}`).then((r) => r.data);
  },

  create(body: ArticleCreateRequest): Promise<ArticleAdminResponse> {
    return apiFetch<Envelope<ArticleAdminResponse>>('/admin/articles', { method: 'POST', body }).then((r) => r.data);
  },

  update(id: string, body: ArticleUpdateRequest): Promise<ArticleAdminResponse> {
    return apiFetch<Envelope<ArticleAdminResponse>>(`/admin/articles/${id}`, { method: 'PATCH', body }).then(
      (r) => r.data,
    );
  },

  autosave(id: string, body: ArticleAutosaveRequest): Promise<ArticleAdminResponse> {
    return apiFetch<Envelope<ArticleAdminResponse>>(`/admin/articles/${id}/autosave`, {
      method: 'PATCH',
      body,
    }).then((r) => r.data);
  },

  remove(id: string): Promise<void> {
    return apiFetch<void>(`/admin/articles/${id}`, { method: 'DELETE' });
  },

  publish(id: string): Promise<ArticleAdminResponse> {
    return apiFetch<Envelope<ArticleAdminResponse>>(`/admin/articles/${id}/publish`, { method: 'POST' }).then(
      (r) => r.data,
    );
  },

  unpublish(id: string): Promise<ArticleAdminResponse> {
    return apiFetch<Envelope<ArticleAdminResponse>>(`/admin/articles/${id}/unpublish`, { method: 'POST' }).then(
      (r) => r.data,
    );
  },

  schedule(id: string, body: ArticleScheduleRequest): Promise<ArticleAdminResponse> {
    return apiFetch<Envelope<ArticleAdminResponse>>(`/admin/articles/${id}/schedule`, {
      method: 'POST',
      body,
    }).then((r) => r.data);
  },

  preview(id: string): Promise<ArticlePublicDetail> {
    return apiFetch<Envelope<ArticlePublicDetail>>(`/admin/articles/${id}/preview`).then((r) => r.data);
  },
};
