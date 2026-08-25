import { describe, expect, it, vi } from 'vitest';

const revalidateHomePathMock = vi.fn().mockResolvedValue(undefined);
vi.mock('../../lib/revalidate.js', () => ({
  revalidateHomePath: (...args: unknown[]) => revalidateHomePathMock(...args),
}));

import { AppError } from '../../middleware/errorHandler.js';
import { createPartnerService, createPublicPartnerService } from './partner.service.js';
import type { PartnerRepository, PartnerRow } from './partner.repository.js';
import type { Logger } from '../../lib/logger.js';

function row(overrides: Partial<PartnerRow> & Pick<PartnerRow, 'id'>): PartnerRow {
  return {
    name: 'Acme Corp',
    logoMediaId: '11111111-1111-1111-1111-000000000001',
    logoStoragePath: '2026/08/logo.webp',
    websiteUrl: 'https://acme.example.com',
    sortOrder: 0,
    isActive: true,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

function foreignKeyViolation(): Error {
  return Object.assign(new Error('Cannot add or update a child row: a foreign key constraint fails'), {
    errno: 1452,
    code: 'ER_NO_REFERENCED_ROW_2',
  });
}

function createFakePartnerRepository(initial: PartnerRow[] = []) {
  let stored = [...initial];
  let rejectNextCreate = false;
  let rejectNextUpdate = false;
  let rejectNextReorder: AppError | undefined;

  const repository: PartnerRepository = {
    async create(input) {
      if (rejectNextCreate) {
        rejectNextCreate = false;
        throw foreignKeyViolation();
      }
      const created = row({
        id: `generated-${stored.length}`,
        sortOrder: stored.length,
        name: input.name,
        logoMediaId: input.logoMediaId,
        websiteUrl: input.websiteUrl ?? null,
        isActive: input.isActive ?? true,
      });
      stored.push(created);
      return created;
    },
    async findById(id) {
      return stored.find((r) => r.id === id) ?? null;
    },
    async list() {
      return stored;
    },
    async update(id, input) {
      if (rejectNextUpdate) {
        rejectNextUpdate = false;
        throw foreignKeyViolation();
      }
      const existing = stored.find((r) => r.id === id);
      if (!existing) throw new Error('not found');
      const updated: PartnerRow = {
        ...existing,
        name: input.name ?? existing.name,
        logoMediaId: input.logoMediaId ?? existing.logoMediaId,
        // `websiteUrl` distinguishes omitted (leave as-is) from explicit `null` (clear) — a plain
        // `??` would treat both the same, mirroring the real repository's `stripUndefined`
        // behavior over a plain object.
        websiteUrl: 'websiteUrl' in input ? (input.websiteUrl ?? null) : existing.websiteUrl,
        isActive: input.isActive ?? existing.isActive,
        updatedAt: new Date(),
      };
      stored = stored.map((r) => (r.id === id ? updated : r));
      return updated;
    },
    async delete(id) {
      stored = stored.filter((r) => r.id !== id);
    },
    async reorder(partnerIds) {
      if (rejectNextReorder) {
        const err = rejectNextReorder;
        rejectNextReorder = undefined;
        throw err;
      }
      const byId = new Map(stored.map((r) => [r.id, r]));
      stored = partnerIds.map((id, sortOrder) => ({ ...byId.get(id)!, sortOrder }));
      return stored;
    },
    async listActiveOrdered() {
      return stored.filter((r) => r.isActive);
    },
  };

  return {
    repository,
    forceNextCreateToRejectAsInvalidLogo: () => (rejectNextCreate = true),
    forceNextUpdateToRejectAsInvalidLogo: () => (rejectNextUpdate = true),
    forceNextReorderToRejectAsInvalidSet: () =>
      (rejectNextReorder = new AppError('bad set', 400, 'invalid_partner_set')),
  };
}

const revalidateEnv = { APP_ORIGIN: 'https://example.com', REVALIDATE_SECRET: 'x'.repeat(16) };
const logger = { warn: vi.fn(), error: vi.fn(), info: vi.fn(), fatal: vi.fn() } as unknown as Logger;

describe('PartnerService.create', () => {
  it('rejects with invalid_logo_media when the logo does not reference an existing media item', async () => {
    revalidateHomePathMock.mockClear();
    const { repository, forceNextCreateToRejectAsInvalidLogo } = createFakePartnerRepository();
    forceNextCreateToRejectAsInvalidLogo();
    const service = createPartnerService(repository, revalidateEnv, logger);

    await expect(
      service.create({ name: 'Acme', logoMediaId: 'missing', websiteUrl: 'https://acme.example.com' }),
    ).rejects.toMatchObject({ code: 'invalid_logo_media' });
    expect(revalidateHomePathMock).not.toHaveBeenCalled();
  });

  it('revalidates the home page on a successful create', async () => {
    revalidateHomePathMock.mockClear();
    const { repository } = createFakePartnerRepository();
    const service = createPartnerService(repository, revalidateEnv, logger);

    await service.create({ name: 'Acme', logoMediaId: '11111111-1111-1111-1111-000000000001', websiteUrl: 'https://acme.example.com' });

    expect(revalidateHomePathMock).toHaveBeenCalledTimes(1);
  });

  it('creates a partner with no website URL', async () => {
    const { repository } = createFakePartnerRepository();
    const service = createPartnerService(repository, revalidateEnv, logger);

    const created = await service.create({ name: 'Acme', logoMediaId: '11111111-1111-1111-1111-000000000001' });

    expect(created.websiteUrl).toBeNull();
  });
});

describe('PartnerService.update', () => {
  it('rejects with not_found for a non-existent partner', async () => {
    const { repository } = createFakePartnerRepository();
    const service = createPartnerService(repository, revalidateEnv, logger);

    await expect(service.update('missing', { name: 'New name' })).rejects.toMatchObject({ code: 'not_found' });
  });

  it('rejects with invalid_logo_media when the new logo does not reference an existing media item', async () => {
    const { repository, forceNextUpdateToRejectAsInvalidLogo } = createFakePartnerRepository([row({ id: 'a' })]);
    forceNextUpdateToRejectAsInvalidLogo();
    const service = createPartnerService(repository, revalidateEnv, logger);

    await expect(service.update('a', { logoMediaId: 'missing' })).rejects.toMatchObject({ code: 'invalid_logo_media' });
  });

  it('revalidates the home page on a successful update, including an active-flag-only change', async () => {
    revalidateHomePathMock.mockClear();
    const { repository } = createFakePartnerRepository([row({ id: 'a' })]);
    const service = createPartnerService(repository, revalidateEnv, logger);

    await service.update('a', { isActive: false });

    expect(revalidateHomePathMock).toHaveBeenCalledTimes(1);
  });

  it('clears the website URL when explicitly updated to null', async () => {
    const { repository } = createFakePartnerRepository([row({ id: 'a', websiteUrl: 'https://acme.example.com' })]);
    const service = createPartnerService(repository, revalidateEnv, logger);

    const updated = await service.update('a', { websiteUrl: null });

    expect(updated.websiteUrl).toBeNull();
  });

  it('leaves the website URL unchanged when the field is omitted from the update', async () => {
    const { repository } = createFakePartnerRepository([row({ id: 'a', websiteUrl: 'https://acme.example.com' })]);
    const service = createPartnerService(repository, revalidateEnv, logger);

    const updated = await service.update('a', { name: 'New name' });

    expect(updated.websiteUrl).toBe('https://acme.example.com');
  });
});

describe('PartnerService.delete', () => {
  it('rejects with not_found for a non-existent partner', async () => {
    const { repository } = createFakePartnerRepository();
    const service = createPartnerService(repository, revalidateEnv, logger);

    await expect(service.delete('missing')).rejects.toMatchObject({ code: 'not_found' });
  });

  it('revalidates the home page on a successful delete', async () => {
    revalidateHomePathMock.mockClear();
    const { repository } = createFakePartnerRepository([row({ id: 'a' })]);
    const service = createPartnerService(repository, revalidateEnv, logger);

    await service.delete('a');

    expect(revalidateHomePathMock).toHaveBeenCalledTimes(1);
  });
});

describe('PartnerService.reorder', () => {
  it('propagates invalid_partner_set from the repository and does not revalidate', async () => {
    revalidateHomePathMock.mockClear();
    const { repository, forceNextReorderToRejectAsInvalidSet } = createFakePartnerRepository([
      row({ id: 'a' }),
      row({ id: 'b' }),
    ]);
    forceNextReorderToRejectAsInvalidSet();
    const service = createPartnerService(repository, revalidateEnv, logger);

    await expect(service.reorder(['a'])).rejects.toMatchObject({ code: 'invalid_partner_set' });
    expect(revalidateHomePathMock).not.toHaveBeenCalled();
  });

  it('revalidates the home page on a successful reorder', async () => {
    revalidateHomePathMock.mockClear();
    const { repository } = createFakePartnerRepository([row({ id: 'a' }), row({ id: 'b' })]);
    const service = createPartnerService(repository, revalidateEnv, logger);

    const result = await service.reorder(['b', 'a']);

    expect(result.map((r) => r.id)).toEqual(['b', 'a']);
    expect(revalidateHomePathMock).toHaveBeenCalledTimes(1);
  });
});

// "Revalidation failure does not fail the write" is not testable here: this file mocks
// `revalidateHomePath`, so making the mock reject would test a contract the real helper does not
// have (it swallows every failure internally and never rejects), while making it resolve tests
// nothing at all. That claim is covered for real in `partner.service.revalidation.test.ts`, which
// runs the genuine helper over a failing `fetch`.

describe('PublicPartnerService.listPublic', () => {
  it('returns only active partners', async () => {
    const { repository } = createFakePartnerRepository([
      row({ id: 'a', isActive: true }),
      row({ id: 'b', isActive: false }),
    ]);
    const service = createPublicPartnerService(repository);

    const result = await service.listPublic();

    expect(result.map((r) => r.id)).toEqual(['a']);
  });
});
