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

export const contactApi = {
  list(query: ContactMessageQuery = { status: 'all' }): Promise<ContactMessageListResponse> {
    const qs = query.status && query.status !== 'all' ? `?status=${query.status}` : '';
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
