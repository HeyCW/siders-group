import { AppError } from '../../middleware/errorHandler.js';
import { slugifyRequired } from '../../lib/slugify.js';
function slugConflictError() {
    return new AppError('That slug is already in use by another category', 409, 'slug_conflict');
}
function notFoundError() {
    return new AppError('Category not found', 404, 'not_found');
}
export function createCategoryService(repository) {
    return {
        async create(name) {
            const slug = slugifyRequired(name, 'Category name');
            if (await repository.slugExists(slug))
                throw slugConflictError();
            return repository.create({ name, slug });
        },
        async update(id, name) {
            const existing = await repository.findById(id);
            if (!existing)
                throw notFoundError();
            const slug = slugifyRequired(name, 'Category name');
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
    };
}
