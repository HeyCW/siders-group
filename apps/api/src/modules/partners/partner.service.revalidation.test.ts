import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPartnerService } from './partner.service.js';
import type { PartnerRepository, PartnerRow } from './partner.repository.js';
import { createLogger } from '../../lib/logger.js';

/**
 * Deliberately does **not** mock `lib/revalidate.js` — unlike `partner.service.test.ts`, which
 * mocks it to observe *that* revalidation was requested. The claim under test here is
 * "Revalidation failure does not fail the write" (specs/partner-management/spec.md), and a mocked
 * `revalidateHomePath` cannot establish it: the guarantee lives in the real helper's internal
 * try/catch, which the service inherits by awaiting it without one of its own. So this file runs
 * the real helper over a `fetch` that fails, and asserts the write still resolves.
 */
const env = { DEPLOY_TRIGGER_URL: 'https://ci.example.com/dispatch', DEPLOY_TRIGGER_TOKEN: 'c'.repeat(16) };
const logger = createLogger({ LOG_LEVEL: 'silent' as never, NODE_ENV: 'test' });

const LOGO_MEDIA_ID = '11111111-1111-1111-1111-000000000001';

function row(overrides: Partial<PartnerRow> & Pick<PartnerRow, 'id'>): PartnerRow {
  return {
    name: 'Acme Corp',
    logoMediaId: LOGO_MEDIA_ID,
    logoStoragePath: '2026/08/logo.webp',
    websiteUrl: 'https://acme.example.com',
    sortOrder: 0,
    isActive: true,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

/** Every write succeeds; only revalidation is made to fail, so a rejection can come from nowhere
 *  else. */
function repositoryThatAlwaysSucceeds(): PartnerRepository {
  const stored = row({ id: 'a' });
  return {
    async create() {
      return stored;
    },
    async findById() {
      return stored;
    },
    async list() {
      return [stored];
    },
    async update() {
      return stored;
    },
    async delete() {},
    async reorder() {
      return [stored];
    },
    async listActiveOrdered() {
      return [stored];
    },
  };
}

describe('partner writes when revalidation fails', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn().mockRejectedValue(new Error('revalidate endpoint unreachable'));
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('create still resolves, and revalidation was genuinely attempted', async () => {
    const service = createPartnerService(repositoryThatAlwaysSucceeds(), env, logger);

    await expect(
      service.create({ name: 'Acme', logoMediaId: LOGO_MEDIA_ID, websiteUrl: 'https://acme.example.com' }),
    ).resolves.toMatchObject({ id: 'a' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('update, delete and reorder all still resolve', async () => {
    const service = createPartnerService(repositoryThatAlwaysSucceeds(), env, logger);

    await expect(service.update('a', { isActive: false })).resolves.toMatchObject({ id: 'a' });
    await expect(service.delete('a')).resolves.toBeUndefined();
    await expect(service.reorder(['a'])).resolves.toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
