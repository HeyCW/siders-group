import type {
  CommentModerateRequest,
  CommentQueueQuery,
  CommentQueueResponse,
  CommentQueueRow,
  CommentReportsDismissRequest,
  ReaderModerateRequest,
  ReaderQueueQuery,
  ReaderQueueResponse,
  ReaderQueueRow,
} from '@siders/contracts';
import { apiFetch } from './api.js';

interface Envelope<T> {
  success: true;
  data: T;
}

function queryString(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}

export const moderationApi = {
  listComments(query: CommentQueueQuery = { status: 'all', limit: 20 }): Promise<CommentQueueResponse> {
    const qs = queryString({ status: query.status, cursor: query.cursor, limit: query.limit });
    return apiFetch<Envelope<CommentQueueResponse>>(`/admin/comments${qs}`).then((r) => r.data);
  },

  moderateComment(id: string, input: CommentModerateRequest): Promise<CommentQueueRow> {
    return apiFetch<Envelope<CommentQueueRow>>(`/admin/comments/${id}`, { method: 'PATCH', body: input }).then(
      (r) => r.data,
    );
  },

  /** Resolves every open report against a comment without changing its status
   *  (specs/community-moderation/spec.md - "A permitted caller can dismiss a comment's open
   *  reports without removing it"). */
  dismissCommentReports(id: string, input: CommentReportsDismissRequest = {}): Promise<CommentQueueRow> {
    return apiFetch<Envelope<CommentQueueRow>>(`/admin/comments/${id}/reports/dismiss`, {
      method: 'PATCH',
      body: input,
    }).then((r) => r.data);
  },

  listReaders(query: ReaderQueueQuery = { status: 'all', limit: 20, offset: 0 }): Promise<ReaderQueueResponse> {
    const qs = queryString({ search: query.search, status: query.status, limit: query.limit, offset: query.offset });
    return apiFetch<Envelope<ReaderQueueResponse>>(`/admin/readers${qs}`).then((r) => r.data);
  },

  moderateReader(id: string, input: ReaderModerateRequest): Promise<ReaderQueueRow> {
    return apiFetch<Envelope<ReaderQueueRow>>(`/admin/readers/${id}`, { method: 'PATCH', body: input }).then(
      (r) => r.data,
    );
  },
};
