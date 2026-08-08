import type { ReaderAccountResponse } from '@siders/contracts';
import type { ReaderAccountRow } from './session.repository.js';

/** Never let a raw row reach the client — always through this mapper. */
export function toReaderAccountResponse(row: ReaderAccountRow): ReaderAccountResponse {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    avatarUrl: row.avatarUrl,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
  };
}
