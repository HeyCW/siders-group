import { describe, expect, it, vi } from 'vitest';

const revalidateHomePathMock = vi.fn().mockResolvedValue(undefined);
vi.mock('../../lib/revalidate.js', () => ({
  revalidateHomePath: (...args: unknown[]) => revalidateHomePathMock(...args),
}));

import { AppError } from '../../middleware/errorHandler.js';
import { createGuidePickService, createPublicGuidePickService } from './guidePick.service.js';
import type { GuidePickRepository, GuidePickRow } from './guidePick.repository.js';
import type { Logger } from '../../lib/logger.js';

function row(overrides: Partial<GuidePickRow> & Pick<GuidePickRow, 'id'>): GuidePickRow {
  return {
    city: 'Surabaya',
    place: 'Seven Cafe',
    description: 'Wifi kuat dan buka sampai tengah malam.',
    photoMediaId: '11111111-1111-1111-1111-000000000001',
    photoStoragePath: '2026/08/photo.webp',
    videoMediaId: '11111111-1111-1111-1111-000000000002',
    videoStoragePath: '2026/08/video.mp4',
    sortOrder: 0,
    isActive: true,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

/** Mirrors what `mysql2` reports for `ER_NO_REFERENCED_ROW_2` (errno 1452) — `dbErrors.ts`
 *  parses the constraint name out of `sqlMessage`, not off a driver-provided field, so the
 *  fake message has to carry it the way a real one does (guidePick.service.ts -
 *  `invalidMediaReferenceError`). */
function foreignKeyViolation(constraint: 'guide_picks_photo_media_id_media_id_fk' | 'guide_picks_video_media_id_media_id_fk'): Error {
  return Object.assign(new Error('Cannot add or update a child row: a foreign key constraint fails'), {
    errno: 1452,
    code: 'ER_NO_REFERENCED_ROW_2',
    sqlMessage: `Cannot add or update a child row: a foreign key constraint fails (\`siders\`.\`guide_picks\`, CONSTRAINT \`${constraint}\` FOREIGN KEY (...) REFERENCES \`media\` (\`id\`))`,
  });
}

function createFakeGuidePickRepository(initial: GuidePickRow[] = []) {
  let stored = [...initial];
  let rejectNextCreate: 'photo' | 'video' | undefined;
  let rejectNextUpdate: 'photo' | 'video' | undefined;
  let rejectNextReorder: AppError | undefined;

  const repository: GuidePickRepository = {
    async create(input) {
      if (rejectNextCreate) {
        const kind = rejectNextCreate;
        rejectNextCreate = undefined;
        throw foreignKeyViolation(kind === 'video' ? 'guide_picks_video_media_id_media_id_fk' : 'guide_picks_photo_media_id_media_id_fk');
      }
      const created = row({
        id: `generated-${stored.length}`,
        sortOrder: stored.length,
        city: input.city,
        place: input.place,
        description: input.description,
        photoMediaId: input.photoMediaId,
        videoMediaId: input.videoMediaId,
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
        const kind = rejectNextUpdate;
        rejectNextUpdate = undefined;
        throw foreignKeyViolation(kind === 'video' ? 'guide_picks_video_media_id_media_id_fk' : 'guide_picks_photo_media_id_media_id_fk');
      }
      const existing = stored.find((r) => r.id === id);
      if (!existing) throw new Error('not found');
      const updated: GuidePickRow = {
        ...existing,
        city: input.city ?? existing.city,
        place: input.place ?? existing.place,
        description: input.description ?? existing.description,
        photoMediaId: input.photoMediaId ?? existing.photoMediaId,
        videoMediaId: input.videoMediaId ?? existing.videoMediaId,
        isActive: input.isActive ?? existing.isActive,
        updatedAt: new Date(),
      };
      stored = stored.map((r) => (r.id === id ? updated : r));
      return updated;
    },
    async delete(id) {
      stored = stored.filter((r) => r.id !== id);
    },
    async reorder(guidePickIds) {
      if (rejectNextReorder) {
        const err = rejectNextReorder;
        rejectNextReorder = undefined;
        throw err;
      }
      const byId = new Map(stored.map((r) => [r.id, r]));
      stored = guidePickIds.map((id, sortOrder) => ({ ...byId.get(id)!, sortOrder }));
      return stored;
    },
    async listActiveOrdered() {
      return stored.filter((r) => r.isActive);
    },
  };

  return {
    repository,
    forceNextCreateToRejectAsInvalidPhoto: () => (rejectNextCreate = 'photo'),
    forceNextCreateToRejectAsInvalidVideo: () => (rejectNextCreate = 'video'),
    forceNextUpdateToRejectAsInvalidPhoto: () => (rejectNextUpdate = 'photo'),
    forceNextUpdateToRejectAsInvalidVideo: () => (rejectNextUpdate = 'video'),
    forceNextReorderToRejectAsInvalidSet: () =>
      (rejectNextReorder = new AppError('bad set', 400, 'invalid_guide_pick_set')),
  };
}

const revalidateEnv = { DEPLOY_TRIGGER_URL: 'https://ci.example.com/dispatch', DEPLOY_TRIGGER_TOKEN: 'x'.repeat(16) };
const logger = { warn: vi.fn(), error: vi.fn(), info: vi.fn(), fatal: vi.fn() } as unknown as Logger;

const VIDEO_ID = '11111111-1111-1111-1111-000000000002';

describe('GuidePickService.create', () => {
  it('rejects with invalid_photo_media when the photo does not reference an existing media item', async () => {
    revalidateHomePathMock.mockClear();
    const { repository, forceNextCreateToRejectAsInvalidPhoto } = createFakeGuidePickRepository();
    forceNextCreateToRejectAsInvalidPhoto();
    const service = createGuidePickService(repository, revalidateEnv, logger);

    await expect(
      service.create({ city: 'Surabaya', place: 'Seven Cafe', description: 'desc', photoMediaId: 'missing', videoMediaId: VIDEO_ID }),
    ).rejects.toMatchObject({ code: 'invalid_photo_media' });
    expect(revalidateHomePathMock).not.toHaveBeenCalled();
  });

  it('rejects with invalid_video_media when the video does not reference an existing media item', async () => {
    revalidateHomePathMock.mockClear();
    const { repository, forceNextCreateToRejectAsInvalidVideo } = createFakeGuidePickRepository();
    forceNextCreateToRejectAsInvalidVideo();
    const service = createGuidePickService(repository, revalidateEnv, logger);

    await expect(
      service.create({
        city: 'Surabaya',
        place: 'Seven Cafe',
        description: 'desc',
        photoMediaId: '11111111-1111-1111-1111-000000000001',
        videoMediaId: 'missing',
      }),
    ).rejects.toMatchObject({ code: 'invalid_video_media' });
    expect(revalidateHomePathMock).not.toHaveBeenCalled();
  });

  it('revalidates the home page on a successful create', async () => {
    revalidateHomePathMock.mockClear();
    const { repository } = createFakeGuidePickRepository();
    const service = createGuidePickService(repository, revalidateEnv, logger);

    await service.create({
      city: 'Surabaya',
      place: 'Seven Cafe',
      description: 'desc',
      photoMediaId: '11111111-1111-1111-1111-000000000001',
      videoMediaId: VIDEO_ID,
    });

    expect(revalidateHomePathMock).toHaveBeenCalledTimes(1);
  });
});

describe('GuidePickService.update', () => {
  it('rejects with not_found for a non-existent guide pick', async () => {
    const { repository } = createFakeGuidePickRepository();
    const service = createGuidePickService(repository, revalidateEnv, logger);

    await expect(service.update('missing', { city: 'New city' })).rejects.toMatchObject({ code: 'not_found' });
  });

  it('rejects with invalid_photo_media when the new photo does not reference an existing media item', async () => {
    const { repository, forceNextUpdateToRejectAsInvalidPhoto } = createFakeGuidePickRepository([row({ id: 'a' })]);
    forceNextUpdateToRejectAsInvalidPhoto();
    const service = createGuidePickService(repository, revalidateEnv, logger);

    await expect(service.update('a', { photoMediaId: 'missing' })).rejects.toMatchObject({
      code: 'invalid_photo_media',
    });
  });

  it('rejects with invalid_video_media when the new video does not reference an existing media item', async () => {
    const { repository, forceNextUpdateToRejectAsInvalidVideo } = createFakeGuidePickRepository([row({ id: 'a' })]);
    forceNextUpdateToRejectAsInvalidVideo();
    const service = createGuidePickService(repository, revalidateEnv, logger);

    await expect(service.update('a', { videoMediaId: 'missing' })).rejects.toMatchObject({
      code: 'invalid_video_media',
    });
  });

  it('revalidates the home page on a successful update, including an active-flag-only change', async () => {
    revalidateHomePathMock.mockClear();
    const { repository } = createFakeGuidePickRepository([row({ id: 'a' })]);
    const service = createGuidePickService(repository, revalidateEnv, logger);

    await service.update('a', { isActive: false });

    expect(revalidateHomePathMock).toHaveBeenCalledTimes(1);
  });
});

describe('GuidePickService.delete', () => {
  it('rejects with not_found for a non-existent guide pick', async () => {
    const { repository } = createFakeGuidePickRepository();
    const service = createGuidePickService(repository, revalidateEnv, logger);

    await expect(service.delete('missing')).rejects.toMatchObject({ code: 'not_found' });
  });

  it('revalidates the home page on a successful delete', async () => {
    revalidateHomePathMock.mockClear();
    const { repository } = createFakeGuidePickRepository([row({ id: 'a' })]);
    const service = createGuidePickService(repository, revalidateEnv, logger);

    await service.delete('a');

    expect(revalidateHomePathMock).toHaveBeenCalledTimes(1);
  });
});

describe('GuidePickService.reorder', () => {
  it('propagates invalid_guide_pick_set from the repository and does not revalidate', async () => {
    revalidateHomePathMock.mockClear();
    const { repository, forceNextReorderToRejectAsInvalidSet } = createFakeGuidePickRepository([
      row({ id: 'a' }),
      row({ id: 'b' }),
    ]);
    forceNextReorderToRejectAsInvalidSet();
    const service = createGuidePickService(repository, revalidateEnv, logger);

    await expect(service.reorder(['a'])).rejects.toMatchObject({ code: 'invalid_guide_pick_set' });
    expect(revalidateHomePathMock).not.toHaveBeenCalled();
  });

  it('revalidates the home page on a successful reorder', async () => {
    revalidateHomePathMock.mockClear();
    const { repository } = createFakeGuidePickRepository([row({ id: 'a' }), row({ id: 'b' })]);
    const service = createGuidePickService(repository, revalidateEnv, logger);

    const result = await service.reorder(['b', 'a']);

    expect(result.map((r) => r.id)).toEqual(['b', 'a']);
    expect(revalidateHomePathMock).toHaveBeenCalledTimes(1);
  });

  it('accepts a reorder set larger than any other admin-managed list permits — no cap', async () => {
    revalidateHomePathMock.mockClear();
    const many = Array.from({ length: 25 }, (_, i) => row({ id: `id-${i}` }));
    const { repository } = createFakeGuidePickRepository(many);
    const service = createGuidePickService(repository, revalidateEnv, logger);

    const result = await service.reorder(many.map((r) => r.id).reverse());

    expect(result).toHaveLength(25);
  });
});

// "Revalidation failure does not fail the write" is not testable here: this file mocks
// `revalidateHomePath`, so making the mock reject would test a contract the real helper does not
// have (it swallows every failure internally and never rejects), while making it resolve tests
// nothing at all. That claim is covered for real in `guidePick.service.revalidation.test.ts`,
// which runs the genuine helper over a failing `fetch`.

describe('PublicGuidePickService.listPublic', () => {
  it('returns only active guide picks', async () => {
    const { repository } = createFakeGuidePickRepository([
      row({ id: 'a', isActive: true }),
      row({ id: 'b', isActive: false }),
    ]);
    const service = createPublicGuidePickService(repository);

    const result = await service.listPublic();

    expect(result.map((r) => r.id)).toEqual(['a']);
  });
});
