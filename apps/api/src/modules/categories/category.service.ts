import { AppError } from '../../middleware/errorHandler.js';
import { slugify } from '../../lib/slugify.js';
import type { CategoryRepository, CategoryRow } from './category.repository.js';

function slugConflictError(): AppError {
  return new AppError('That slug is already in use by another category', 409, 'slug_conflict');
}

function notFoundError(): AppError {
  return new AppError('Category not found', 404, 'not_found');
}

export interface CategoryService {
  create(name: string): Promise<CategoryRow>;
  update(id: string, name: string): Promise<CategoryRow>;
  delete(id: string): Promise<void>;
  list(): Promise<CategoryRow[]>;
}

export function createCategoryService(repository: CategoryRepository): CategoryService {
  return {
    async create(name) {
      const slug = slugify(name);
      if (await repository.slugExists(slug)) throw slugConflictError();
      return repository.create({ name, slug });
    },

    async update(id, name) {
      const existing = await repository.findById(id);
      if (!existing) throw notFoundError();
      const slug = slugify(name);
      if (slug !== existing.slug && (await repository.slugExists(slug, id))) throw slugConflictError();
      return repository.update(id, { name, slug });
    },

    async delete(id) {
      const existing = await repository.findById(id);
      if (!existing) throw notFoundError();
      await repository.delete(id);
    },

    list() {
      return repository.list();
    },
  };
}
