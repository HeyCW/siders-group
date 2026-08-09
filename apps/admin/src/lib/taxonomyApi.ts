import type { CategoryResponse, TagResponse } from '@siders/contracts';
import { apiFetch } from './api.js';

interface Envelope<T> {
  success: true;
  data: T;
}

function makeTaxonomyApi(resource: 'categories' | 'tags') {
  return {
    list<T = CategoryResponse | TagResponse>(): Promise<T[]> {
      return apiFetch<Envelope<T[]>>(`/${resource}`).then((r) => r.data);
    },
    create<T = CategoryResponse | TagResponse>(name: string): Promise<T> {
      return apiFetch<Envelope<T>>(`/${resource}`, { method: 'POST', body: { name } }).then((r) => r.data);
    },
    update<T = CategoryResponse | TagResponse>(id: string, name: string): Promise<T> {
      return apiFetch<Envelope<T>>(`/${resource}/${id}`, { method: 'PATCH', body: { name } }).then((r) => r.data);
    },
    remove(id: string): Promise<void> {
      return apiFetch<void>(`/${resource}/${id}`, { method: 'DELETE' });
    },
  };
}

export const categoriesApi = {
  list: () => makeTaxonomyApi('categories').list<CategoryResponse>(),
  create: (name: string) => makeTaxonomyApi('categories').create<CategoryResponse>(name),
  update: (id: string, name: string) => makeTaxonomyApi('categories').update<CategoryResponse>(id, name),
  remove: (id: string) => makeTaxonomyApi('categories').remove(id),
};

export const tagsApi = {
  list: () => makeTaxonomyApi('tags').list<TagResponse>(),
  create: (name: string) => makeTaxonomyApi('tags').create<TagResponse>(name),
  update: (id: string, name: string) => makeTaxonomyApi('tags').update<TagResponse>(id, name),
  remove: (id: string) => makeTaxonomyApi('tags').remove(id),
};
