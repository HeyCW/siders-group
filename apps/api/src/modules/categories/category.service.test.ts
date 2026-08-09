import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createCategoryService } from './category.service.js';
import type { CategoryRepository, CategoryRow } from './category.repository.js';

function createFakeCategoryRepository() {
  const rows = new Map<string, CategoryRow>();
  const repository: CategoryRepository = {
    async create(input) {
      const row = { id: randomUUID(), ...input };
      rows.set(row.id, row);
      return row;
    },
    async update(id, input) {
      const existing = rows.get(id);
      if (!existing) throw new Error('not found');
      const updated = { ...existing, ...input };
      rows.set(id, updated);
      return updated;
    },
    async findById(id) {
      return rows.get(id) ?? null;
    },
    async slugExists(slug, excludeId) {
      const holder = [...rows.values()].find((r) => r.slug === slug);
      return holder !== undefined && holder.id !== excludeId;
    },
    async delete(id) {
      rows.delete(id);
    },
    async list() {
      return [...rows.values()];
    },
  };
  return { repository, rows };
}

describe('CategoryService', () => {
  it('creates a category with a slug derived from the name', async () => {
    const { repository } = createFakeCategoryRepository();
    const service = createCategoryService(repository);
    const category = await service.create('Local Sports');
    expect(category.slug).toBe('local-sports');
  });

  it('rejects a duplicate slug on create', async () => {
    const { repository } = createFakeCategoryRepository();
    const service = createCategoryService(repository);
    await service.create('Business');
    await expect(service.create('Business')).rejects.toMatchObject({ code: 'slug_conflict' });
  });

  it('allows renaming a category to a new, unused slug', async () => {
    const { repository } = createFakeCategoryRepository();
    const service = createCategoryService(repository);
    const category = await service.create('Old Name');
    const renamed = await service.update(category.id, 'New Name');
    expect(renamed.slug).toBe('new-name');
  });

  it('allows renaming a category without changing its own slug', async () => {
    const { repository } = createFakeCategoryRepository();
    const service = createCategoryService(repository);
    const category = await service.create('Stable');
    const renamed = await service.update(category.id, 'Stable');
    expect(renamed.slug).toBe('stable');
  });

  it('404s updating an unknown category', async () => {
    const { repository } = createFakeCategoryRepository();
    const service = createCategoryService(repository);
    await expect(service.update('missing-id', 'x')).rejects.toMatchObject({ code: 'not_found' });
  });

  it('404s deleting an unknown category', async () => {
    const { repository } = createFakeCategoryRepository();
    const service = createCategoryService(repository);
    await expect(service.delete('missing-id')).rejects.toMatchObject({ code: 'not_found' });
  });
});
