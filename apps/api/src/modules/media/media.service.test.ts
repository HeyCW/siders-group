import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const storeUploadMock = vi.fn();
const deleteStoredFileMock = vi.fn().mockResolvedValue(undefined);
vi.mock('../../lib/mediaStorage.js', () => ({
  storeUpload: (...args: unknown[]) => storeUploadMock(...args),
  deleteStoredFile: (...args: unknown[]) => deleteStoredFileMock(...args),
}));

import { createMediaService } from './media.service.js';
import type { MediaRepository, MediaRow } from './media.repository.js';

function createFakeMediaRepository() {
  const rows = new Map<string, MediaRow>();
  const repository: MediaRepository = {
    async create(input) {
      const row: MediaRow = { id: randomUUID(), createdAt: new Date(), ...input };
      rows.set(row.id, row);
      return row;
    },
    async findById(id) {
      return rows.get(id) ?? null;
    },
    async update(id, input) {
      const existing = rows.get(id);
      if (!existing) throw new Error('not found');
      const updated: MediaRow = {
        ...existing,
        ...(input.alt !== undefined && { alt: input.alt }),
        ...(input.caption !== undefined && { caption: input.caption }),
      };
      rows.set(id, updated);
      return updated;
    },
    async delete(id) {
      rows.delete(id);
    },
  };
  return { repository, rows };
}

const env = { MEDIA_STORAGE_PATH: '/data/media', MEDIA_MAX_IMAGE_BYTES: 1024, MEDIA_MAX_VIDEO_BYTES: 4096 };

describe('MediaService', () => {
  beforeEach(() => {
    storeUploadMock.mockReset();
    deleteStoredFileMock.mockClear();
  });

  it('creates a media record from a successfully stored upload', async () => {
    storeUploadMock.mockResolvedValue({ storagePath: '2026/08/x.png', mime: 'image/png', sizeBytes: 100 });
    const { repository } = createFakeMediaRepository();
    const service = createMediaService(env, repository);
    const row = await service.upload({
      tempPath: '/tmp/x',
      sizeBytes: 1,
      declaredMime: 'image/png',
      originalFilename: 'photo.png',
      uploadedBy: 'staff-1',
    });
    expect(row.storagePath).toBe('2026/08/x.png');
    expect(row.uploadedBy).toBe('staff-1');
  });

  it('deletes the just-written file if the database insert fails, leaving no residue', async () => {
    storeUploadMock.mockResolvedValue({ storagePath: '2026/08/orphan.png', mime: 'image/png', sizeBytes: 100 });
    const { repository } = createFakeMediaRepository();
    repository.create = vi.fn().mockRejectedValue(new Error('db down'));
    const service = createMediaService(env, repository);
    await expect(
      service.upload({ tempPath: '/tmp/x', sizeBytes: 1, declaredMime: 'image/png', originalFilename: 'photo.png', uploadedBy: 'staff-1' }),
    ).rejects.toThrow('db down');
    expect(deleteStoredFileMock).toHaveBeenCalledWith(env, '2026/08/orphan.png');
  });

  it('deletes the stored file when a media record is deleted', async () => {
    storeUploadMock.mockResolvedValue({ storagePath: '2026/08/y.png', mime: 'image/png', sizeBytes: 50 });
    const { repository } = createFakeMediaRepository();
    const service = createMediaService(env, repository);
    const row = await service.upload({
      tempPath: '/tmp/y',
      sizeBytes: 1,
      declaredMime: 'image/png',
      originalFilename: 'y.png',
      uploadedBy: 'staff-1',
    });
    await service.delete(row.id);
    expect(deleteStoredFileMock).toHaveBeenCalledWith(env, '2026/08/y.png');
    await expect(service.get(row.id)).rejects.toMatchObject({ code: 'not_found' });
  });

  it('404s deleting an unknown media id', async () => {
    const { repository } = createFakeMediaRepository();
    const service = createMediaService(env, repository);
    await expect(service.delete('missing')).rejects.toMatchObject({ code: 'not_found' });
  });

  it('propagates storeUpload validation failures without creating a record', async () => {
    storeUploadMock.mockRejectedValue(Object.assign(new Error('bad type'), { code: 'unsupported_media_type' }));
    const { repository, rows } = createFakeMediaRepository();
    const service = createMediaService(env, repository);
    await expect(
      service.upload({ tempPath: '/tmp/x', sizeBytes: 1, declaredMime: 'image/png', originalFilename: 'x.png', uploadedBy: 'staff-1' }),
    ).rejects.toMatchObject({ code: 'unsupported_media_type' });
    expect(rows.size).toBe(0);
  });
});
