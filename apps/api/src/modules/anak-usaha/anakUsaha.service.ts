import { AppError } from '../../middleware/errorHandler.js';
import { slugifyRequired } from '../../lib/slugify.js';
import type { AnakUsahaRepository, AnakUsahaRow } from './anakUsaha.repository.js';

function slugConflictError(): AppError {
  return new AppError('That slug is already in use by another anak usaha entry', 409, 'slug_conflict');
}

function notFoundError(): AppError {
  return new AppError('Anak usaha not found', 404, 'not_found');
}

export interface AnakUsahaService {
  create(name: string): Promise<AnakUsahaRow>;
  update(id: string, name: string): Promise<AnakUsahaRow>;
  delete(id: string): Promise<void>;
  list(): Promise<AnakUsahaRow[]>;
}

export function createAnakUsahaService(repository: AnakUsahaRepository): AnakUsahaService {
  return {
    async create(name) {
      const slug = slugifyRequired(name, 'Anak usaha name');
      if (await repository.slugExists(slug)) throw slugConflictError();
      return repository.create({ name, slug });
    },

    async update(id, name) {
      const existing = await repository.findById(id);
      if (!existing) throw notFoundError();
      const slug = slugifyRequired(name, 'Anak usaha name');
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
