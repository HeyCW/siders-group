import type { AnakUsahaResponse } from '@siders/contracts';
import type { AnakUsahaRow } from './anakUsaha.repository.js';

export function toAnakUsahaResponse(row: AnakUsahaRow): AnakUsahaResponse {
  return { id: row.id, name: row.name, slug: row.slug };
}
