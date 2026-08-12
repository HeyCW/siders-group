import type { TagResponse } from '@siders/contracts';
import type { TagRow } from './tag.repository.js';

export function toTagResponse(row: TagRow): TagResponse {
  return { id: row.id, name: row.name, slug: row.slug };
}
