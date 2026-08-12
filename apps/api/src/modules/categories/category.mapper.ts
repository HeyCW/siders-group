import type { CategoryResponse } from '@siders/contracts';
import type { CategoryRow } from './category.repository.js';

export function toCategoryResponse(row: CategoryRow): CategoryResponse {
  return { id: row.id, name: row.name, slug: row.slug };
}
