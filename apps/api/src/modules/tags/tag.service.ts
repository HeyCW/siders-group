import { AppError } from '../../middleware/errorHandler.js';
import { slugifyRequired } from '../../lib/slugify.js';
import type { TagRepository, TagRow } from './tag.repository.js';

function slugConflictError(): AppError {
  return new AppError('That slug is already in use by another tag', 409, 'slug_conflict');
}

function notFoundError(): AppError {
  return new AppError('Tag not found', 404, 'not_found');
}

export interface TagService {
  create(name: string): Promise<TagRow>;
  update(id: string, name: string): Promise<TagRow>;
  delete(id: string): Promise<void>;
  list(): Promise<TagRow[]>;
}

export function createTagService(repository: TagRepository): TagService {
  return {
    async create(name) {
      const slug = slugifyRequired(name, 'Tag name');
      if (await repository.slugExists(slug)) throw slugConflictError();
      return repository.create({ name, slug });
    },

    async update(id, name) {
      const existing = await repository.findById(id);
      if (!existing) throw notFoundError();
      const slug = slugifyRequired(name, 'Tag name');
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
