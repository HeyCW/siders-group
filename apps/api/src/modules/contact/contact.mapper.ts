import type { ContactMessageRow as ContactMessageRowDto, ContactMessageSubmitResponse } from '@siders/contracts';
import type { ContactMessageRow } from './contact.repository.js';

export function toContactMessageSubmitResponse(row: ContactMessageRow): ContactMessageSubmitResponse {
  return {
    id: row.id,
    createdAt: row.createdAt.toISOString(),
  };
}

export function toContactMessageRow(row: ContactMessageRow): ContactMessageRowDto {
  return {
    id: row.id,
    name: row.name,
    organisation: row.organisation,
    email: row.email,
    subject: row.subject,
    message: row.message,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
  };
}
