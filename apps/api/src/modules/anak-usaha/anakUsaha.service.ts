import type {
  AnakUsahaProfileCreateRequest,
  AnakUsahaProfileUpdateRequest,
  AnakUsahaProfileReorderRequest,
} from '@siders/contracts';
import { AppError } from '../../middleware/errorHandler.js';
import { slugifyRequired } from '../../lib/slugify.js';
import type {
  AnakUsahaProfileFields,
  AnakUsahaRepository,
  AnakUsahaRow,
  AnakUsahaWithProfileRow,
} from './anakUsaha.repository.js';

function slugConflictError(): AppError {
  return new AppError('That slug is already in use by another anak usaha entry', 409, 'slug_conflict');
}

function notFoundError(): AppError {
  return new AppError('Anak usaha not found', 404, 'not_found');
}

function profileNotFoundError(): AppError {
  return new AppError('This anak usaha entry has no profile', 404, 'profile_not_found');
}

export interface AnakUsahaService {
  create(name: string): Promise<AnakUsahaRow>;
  update(id: string, name: string): Promise<AnakUsahaRow>;
  delete(id: string): Promise<void>;
  list(): Promise<AnakUsahaRow[]>;
  /** Every entry with its profile, or `null` — backs both the public listing (mapped down to
   *  presentation fields only when active) and the admin presentation screen (mapped in full). */
  listWithProfile(): Promise<AnakUsahaWithProfileRow[]>;
  findWithProfile(anakUsahaId: string): Promise<AnakUsahaWithProfileRow | null>;
  createProfile(anakUsahaId: string, input: AnakUsahaProfileCreateRequest): Promise<AnakUsahaProfileFields>;
  updateProfile(anakUsahaId: string, input: AnakUsahaProfileUpdateRequest): Promise<AnakUsahaProfileFields>;
  /** Removes only the profile — see `AnakUsahaRepository.deleteProfile`. */
  deleteProfile(anakUsahaId: string): Promise<void>;
  reorderProfiles(anakUsahaIds: AnakUsahaProfileReorderRequest['anakUsahaIds']): Promise<AnakUsahaWithProfileRow[]>;
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

    listWithProfile() {
      return repository.listWithProfile();
    },

    findWithProfile(anakUsahaId) {
      return repository.findWithProfile(anakUsahaId);
    },

    async createProfile(anakUsahaId, input) {
      return repository.createProfile({ anakUsahaId, ...input });
    },

    async updateProfile(anakUsahaId, input) {
      const existing = await repository.findProfile(anakUsahaId);
      if (!existing) throw profileNotFoundError();
      return repository.updateProfile(anakUsahaId, input);
    },

    async deleteProfile(anakUsahaId) {
      const existing = await repository.findProfile(anakUsahaId);
      if (!existing) throw profileNotFoundError();
      await repository.deleteProfile(anakUsahaId);
    },

    reorderProfiles(anakUsahaIds) {
      return repository.reorderProfiles(anakUsahaIds);
    },
  };
}
