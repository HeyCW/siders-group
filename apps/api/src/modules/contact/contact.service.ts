import type { ContactMessageStatusFilter } from '@siders/contracts';
import { AppError } from '../../middleware/errorHandler.js';
import type { ContactMessageRepository, ContactMessageRow, SubmitContactMessageInput } from './contact.repository.js';

export interface PublicContactService {
  submit(input: SubmitContactMessageInput): Promise<ContactMessageRow>;
}

/** No `RevalidateEnv` or `Logger` — a submission never changes anything the public site renders,
 *  mirroring `createPublicPartnerService`'s reasoning for its own minimal shape. */
export function createPublicContactService(repository: ContactMessageRepository): PublicContactService {
  return {
    submit(input) {
      return repository.submit(input);
    },
  };
}

export interface ContactMessageService {
  list(filter: ContactMessageStatusFilter): Promise<ContactMessageRow[]>;
  countUnread(): Promise<number>;
  setStatus(id: string, status: 'new' | 'read'): Promise<ContactMessageRow>;
}

export function createContactMessageService(repository: ContactMessageRepository): ContactMessageService {
  return {
    list(filter) {
      return repository.list(filter);
    },

    countUnread() {
      return repository.countUnread();
    },

    async setStatus(id, status) {
      const updated = await repository.setStatus(id, status);
      if (!updated) throw new AppError('Contact message not found', 404, 'not_found');
      return updated;
    },
  };
}
