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

interface PagedEnvelope<T> extends Envelope<T> {
  meta?: { total: number };
}

const LIST_PAGE_SIZE = 100;

export const articlesApi = {
  /** Every article, not just the API's first page — walks the pages until `meta.total` is reached. */
  async list(status?: ArticleStatus): Promise<ArticleAdminResponse[]> {
    const all: ArticleAdminResponse[] = [];
    for (let page = 1; ; page++) {
      const params = new URLSearchParams({ page: String(page), perPage: String(LIST_PAGE_SIZE) });
      if (status) params.set('status', status);

      const res = await apiFetch<PagedEnvelope<ArticleAdminResponse[]>>(`/admin/articles?${params}`);
      all.push(...res.data);

      if (res.data.length === 0 || all.length >= (res.meta?.total ?? 0)) return all;
    }
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
