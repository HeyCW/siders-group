import type {
  ContactMessageListResponse,
  ContactMessageQuery,
  ContactMessageRow,
  ContactMessageUnreadCountResponse,
  ContactMessageUpdateRequest,
} from '@siders/contracts';
import { apiFetch } from './api.js';

interface Envelope<T> {
  success: true;
  data: T;
}

// Matches `moderationApi.ts`'s own `queryString` helper shape rather than interpolating the
// status value directly.
function queryString(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}

export const contactApi = {
  list(query: ContactMessageQuery = { status: 'all' }): Promise<ContactMessageListResponse> {
    const qs = queryString({ status: query.status && query.status !== 'all' ? query.status : undefined });
    return apiFetch<Envelope<ContactMessageListResponse>>(`/admin/contact-messages${qs}`).then((r) => r.data);
  },

  unreadCount(): Promise<ContactMessageUnreadCountResponse> {
    return apiFetch<Envelope<ContactMessageUnreadCountResponse>>('/admin/contact-messages/unread-count').then(
      (r) => r.data,
    );
  },

  setStatus(id: string, input: ContactMessageUpdateRequest): Promise<ContactMessageRow> {
    return apiFetch<Envelope<ContactMessageRow>>(`/admin/contact-messages/${id}`, {
      method: 'PATCH',
      body: input,
    }).then((r) => r.data);
  },
};
