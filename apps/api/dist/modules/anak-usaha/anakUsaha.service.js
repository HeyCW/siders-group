import { AppError } from '../../middleware/errorHandler.js';
import { slugifyRequired } from '../../lib/slugify.js';
function slugConflictError() {
    return new AppError('That slug is already in use by another anak usaha entry', 409, 'slug_conflict');
}
function notFoundError() {
    return new AppError('Anak usaha not found', 404, 'not_found');
}
function profileNotFoundError() {
    return new AppError('This anak usaha entry has no profile', 404, 'profile_not_found');
}
export function createAnakUsahaService(repository) {
    return {
        async create(name) {
            const slug = slugifyRequired(name, 'Anak usaha name');
            if (await repository.slugExists(slug))
                throw slugConflictError();
            return repository.create({ name, slug });
        },
        async update(id, name) {
            const existing = await repository.findById(id);
            if (!existing)
                throw notFoundError();
            const slug = slugifyRequired(name, 'Anak usaha name');
            if (slug !== existing.slug && (await repository.slugExists(slug, id)))
                throw slugConflictError();
            return repository.update(id, { name, slug });
        },
        async delete(id) {
            const existing = await repository.findById(id);
            if (!existing)
                throw notFoundError();
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
            if (!existing)
                throw profileNotFoundError();
            return repository.updateProfile(anakUsahaId, input);
        },
        async deleteProfile(anakUsahaId) {
            const existing = await repository.findProfile(anakUsahaId);
            if (!existing)
                throw profileNotFoundError();
            await repository.deleteProfile(anakUsahaId);
        },
        reorderProfiles(anakUsahaIds) {
            return repository.reorderProfiles(anakUsahaIds);
        },
    };
}
