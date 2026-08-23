import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createAnakUsahaService } from './anakUsaha.service.js';
import type {
  AnakUsahaProfileFields,
  AnakUsahaRepository,
  AnakUsahaRow,
} from './anakUsaha.repository.js';

/** In-memory fake, ordering entries with a profile by `sortOrder` (then insertion order) ahead of
 *  entries without one — the same order `listWithProfileJoined`'s `ORDER BY sortOrder, createdAt`
 *  produces against Postgres (NULLS LAST puts profile-less rows after profiled ones). */
function createFakeAnakUsahaRepository() {
  const rows = new Map<string, AnakUsahaRow>();
  const profiles = new Map<string, AnakUsahaProfileFields>();

  function joined(): (AnakUsahaRow & { profile: AnakUsahaProfileFields | null })[] {
    const all = [...rows.values()].map((row) => ({ ...row, profile: profiles.get(row.id) ?? null }));
    const withProfile = all.filter((r) => r.profile !== null).sort((a, b) => a.profile!.sortOrder - b.profile!.sortOrder);
    const withoutProfile = all.filter((r) => r.profile === null);
    return [...withProfile, ...withoutProfile];
  }

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
      profiles.delete(id);
    },
    async list() {
      return [...rows.values()];
    },
    async listWithProfile() {
      return joined();
    },
    async findWithProfile(anakUsahaId) {
      const row = rows.get(anakUsahaId);
      if (!row) return null;
      return { ...row, profile: profiles.get(anakUsahaId) ?? null };
    },
    async findProfile(anakUsahaId) {
      return profiles.get(anakUsahaId) ?? null;
    },
    async createProfile(input) {
      if (profiles.has(input.anakUsahaId)) throw new Error('profile already exists');
      const profile: AnakUsahaProfileFields = {
        logoMediaId: input.logoMediaId ?? null,
        logoStoragePath: null,
        backgroundColor: input.backgroundColor ?? null,
        description: input.description ?? null,
        kind: input.kind,
        links: input.links ?? [],
        sortOrder: profiles.size,
        isActive: true,
      };
      profiles.set(input.anakUsahaId, profile);
      return profile;
    },
    async updateProfile(anakUsahaId, input) {
      const existing = profiles.get(anakUsahaId);
      if (!existing) throw new Error('profile not found');
      const updated: AnakUsahaProfileFields = {
        logoMediaId: input.logoMediaId !== undefined ? input.logoMediaId : existing.logoMediaId,
        logoStoragePath: existing.logoStoragePath,
        backgroundColor: input.backgroundColor !== undefined ? input.backgroundColor : existing.backgroundColor,
        description: input.description !== undefined ? input.description : existing.description,
        kind: input.kind ?? existing.kind,
        links: input.links ?? existing.links,
        sortOrder: existing.sortOrder,
        isActive: input.isActive ?? existing.isActive,
      };
      profiles.set(anakUsahaId, updated);
      return updated;
    },
    async deleteProfile(anakUsahaId) {
      profiles.delete(anakUsahaId);
    },
    async reorderProfiles(anakUsahaIds) {
      anakUsahaIds.forEach((id, index) => {
        const existing = profiles.get(id);
        if (existing) profiles.set(id, { ...existing, sortOrder: index });
      });
      return joined();
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

describe('AnakUsahaService profile', () => {
  it('an entry starts with no profile', async () => {
    const { repository } = createFakeAnakUsahaRepository();
    const service = createAnakUsahaService(repository);
    const entry = await service.create('Siders Culture');
    const [listed] = await service.listWithProfile();
    expect(listed).toMatchObject({ id: entry.id, profile: null });
  });

  it('creates a profile for an existing entry', async () => {
    const { repository } = createFakeAnakUsahaRepository();
    const service = createAnakUsahaService(repository);
    const entry = await service.create('Siders Culture');
    await service.createProfile(entry.id, { kind: 'Media Platform' });
    const [listed] = await service.listWithProfile();
    expect(listed?.profile).toMatchObject({ kind: 'Media Platform', isActive: true });
  });

  it('404s updating a profile that does not exist yet', async () => {
    const { repository } = createFakeAnakUsahaRepository();
    const service = createAnakUsahaService(repository);
    const entry = await service.create('Siders Culture');
    await expect(service.updateProfile(entry.id, { description: 'x' })).rejects.toMatchObject({
      code: 'profile_not_found',
    });
  });

  it('404s deleting a profile that does not exist yet', async () => {
    const { repository } = createFakeAnakUsahaRepository();
    const service = createAnakUsahaService(repository);
    const entry = await service.create('Siders Culture');
    await expect(service.deleteProfile(entry.id)).rejects.toMatchObject({ code: 'profile_not_found' });
  });

  it('updates an existing profile in place', async () => {
    const { repository } = createFakeAnakUsahaRepository();
    const service = createAnakUsahaService(repository);
    const entry = await service.create('Siders Culture');
    await service.createProfile(entry.id, { kind: 'Media Platform', description: 'old' });
    const updated = await service.updateProfile(entry.id, { description: 'new', isActive: false });
    expect(updated).toMatchObject({ description: 'new', isActive: false, kind: 'Media Platform' });
  });

  it('deleting a profile leaves the taxonomy entry and its slug intact', async () => {
    const { repository } = createFakeAnakUsahaRepository();
    const service = createAnakUsahaService(repository);
    const entry = await service.create('Siders Culture');
    await service.createProfile(entry.id, { kind: 'Media Platform' });
    await service.deleteProfile(entry.id);
    const stillExists = await repository.findById(entry.id);
    expect(stillExists).toMatchObject({ id: entry.id, slug: 'siders-culture' });
    const [listed] = await service.listWithProfile();
    expect(listed?.profile).toBeNull();
  });

  it('deleting the taxonomy entry removes its profile too', async () => {
    const { repository } = createFakeAnakUsahaRepository();
    const service = createAnakUsahaService(repository);
    const entry = await service.create('Siders Culture');
    await service.createProfile(entry.id, { kind: 'Media Platform' });
    await service.delete(entry.id);
    expect(await service.listWithProfile()).toEqual([]);
  });

  it('reorders profiles', async () => {
    const { repository } = createFakeAnakUsahaRepository();
    const service = createAnakUsahaService(repository);
    const first = await service.create('Siders Culture');
    const second = await service.create('Surabaya Siders');
    await service.createProfile(first.id, { kind: 'Media Platform' });
    await service.createProfile(second.id, { kind: 'Media Platform' });
    const reordered = await service.reorderProfiles([second.id, first.id]);
    const order = reordered.filter((r) => r.profile !== null).map((r) => r.id);
    expect(order).toEqual([second.id, first.id]);
  });
});
