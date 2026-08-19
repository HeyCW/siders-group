import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createAnakUsahaService } from './anakUsaha.service.js';
import type { AnakUsahaRepository, AnakUsahaRow } from './anakUsaha.repository.js';

function createFakeAnakUsahaRepository() {
  const rows = new Map<string, AnakUsahaRow>();
  const repository: AnakUsahaRepository = {
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

describe('AnakUsahaService', () => {
  it('creates an anak usaha entry with a slug derived from the name', async () => {
    const { repository } = createFakeAnakUsahaRepository();
    const service = createAnakUsahaService(repository);
    const entry = await service.create('Siders Culture');
    expect(entry.slug).toBe('siders-culture');
  });

  it('rejects a duplicate slug on create', async () => {
    const { repository } = createFakeAnakUsahaRepository();
    const service = createAnakUsahaService(repository);
    await service.create('Jakarta Siders');
    await expect(service.create('Jakarta Siders')).rejects.toMatchObject({ code: 'slug_conflict' });
  });

  it('allows renaming an anak usaha entry to a new, unused slug', async () => {
    const { repository } = createFakeAnakUsahaRepository();
    const service = createAnakUsahaService(repository);
    const entry = await service.create('Old Name');
    const renamed = await service.update(entry.id, 'New Name');
    expect(renamed.slug).toBe('new-name');
  });

  it('404s updating an unknown anak usaha entry', async () => {
    const { repository } = createFakeAnakUsahaRepository();
    const service = createAnakUsahaService(repository);
    await expect(service.update('missing-id', 'x')).rejects.toMatchObject({ code: 'not_found' });
  });

  it('404s deleting an unknown anak usaha entry', async () => {
    const { repository } = createFakeAnakUsahaRepository();
    const service = createAnakUsahaService(repository);
    await expect(service.delete('missing-id')).rejects.toMatchObject({ code: 'not_found' });
  });

  it('lists every created entry', async () => {
    const { repository } = createFakeAnakUsahaRepository();
    const service = createAnakUsahaService(repository);
    await service.create('Siders Culture');
    await service.create('Surabaya Siders');
    const list = await service.list();
    expect(list.map((e) => e.name).sort()).toEqual(['Siders Culture', 'Surabaya Siders']);
  });
});
