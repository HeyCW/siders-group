import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createTagService } from './tag.service.js';
import type { TagRepository, TagRow } from './tag.repository.js';

function createFakeTagRepository() {
  const rows = new Map<string, TagRow>();
  const repository: TagRepository = {
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

describe('TagService', () => {
  it('creates a tag with a slug derived from the name', async () => {
    const { repository } = createFakeTagRepository();
    const service = createTagService(repository);
    const tag = await service.create('Breaking News');
    expect(tag.slug).toBe('breaking-news');
  });

  it('rejects a duplicate slug on create', async () => {
    const { repository } = createFakeTagRepository();
    const service = createTagService(repository);
    await service.create('Elections');
    await expect(service.create('Elections')).rejects.toMatchObject({ code: 'slug_conflict' });
  });

  it('404s updating an unknown tag', async () => {
    const { repository } = createFakeTagRepository();
    const service = createTagService(repository);
    await expect(service.update('missing-id', 'x')).rejects.toMatchObject({ code: 'not_found' });
  });

  it('404s deleting an unknown tag', async () => {
    const { repository } = createFakeTagRepository();
    const service = createTagService(repository);
    await expect(service.delete('missing-id')).rejects.toMatchObject({ code: 'not_found' });
  });
});
