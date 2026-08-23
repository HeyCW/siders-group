import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  deleteStoredFile,
  ensureMediaStorageDir,
  MEDIA_TEMP_SUBDIR,
  sniffMimeType,
  storeUpload,
} from './mediaStorage.js';

const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const JPEG_BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]);
const GIF_BYTES = Buffer.from('GIF89a' + 'x'.repeat(10), 'ascii');
const WEBP_BYTES = Buffer.concat([Buffer.from('RIFF', 'ascii'), Buffer.from([0, 0, 0, 0]), Buffer.from('WEBP', 'ascii')]);
const AVIF_BYTES = Buffer.concat([Buffer.from([0, 0, 0, 0]), Buffer.from('ftyp', 'ascii'), Buffer.from('avif', 'ascii')]);
const MP4_BYTES = Buffer.concat([Buffer.from([0, 0, 0, 0]), Buffer.from('ftyp', 'ascii'), Buffer.from('isom', 'ascii')]);
const WEBM_BYTES = Buffer.from([0x1a, 0x45, 0xdf, 0xa3]);
const QUICKTIME_BYTES = Buffer.concat([Buffer.from([0, 0, 0, 0]), Buffer.from('ftyp', 'ascii'), Buffer.from('qt  ', 'ascii')]);
const NOT_AN_IMAGE = Buffer.from('%PDF-1.4 this is a pdf, not an image', 'ascii');

describe('sniffMimeType', () => {
  it('recognizes every accepted image type by its leading bytes', () => {
    expect(sniffMimeType(PNG_BYTES)?.mime).toBe('image/png');
    expect(sniffMimeType(JPEG_BYTES)?.mime).toBe('image/jpeg');
    expect(sniffMimeType(GIF_BYTES)?.mime).toBe('image/gif');
    expect(sniffMimeType(WEBP_BYTES)?.mime).toBe('image/webp');
    expect(sniffMimeType(AVIF_BYTES)?.mime).toBe('image/avif');
  });

  it('recognizes MP4 by its ftyp brand', () => {
    const result = sniffMimeType(MP4_BYTES);
    expect(result?.mime).toBe('video/mp4');
    expect(result?.kind).toBe('video');
  });

  it('distinguishes AVIF from MP4 despite sharing the same ftyp container', () => {
    expect(sniffMimeType(AVIF_BYTES)?.mime).toBe('image/avif');
    expect(sniffMimeType(MP4_BYTES)?.mime).toBe('video/mp4');
  });

  it('does not recognize WebM or QuickTime as MP4', () => {
    expect(sniffMimeType(WEBM_BYTES)).toBeNull();
    expect(sniffMimeType(QUICKTIME_BYTES)).toBeNull();
  });

  it('returns null for a non-image, non-video buffer', () => {
    expect(sniffMimeType(NOT_AN_IMAGE)).toBeNull();
  });
});

describe('storeUpload', () => {
  let storageRoot: string;
  const env = () => ({ MEDIA_STORAGE_PATH: storageRoot, MEDIA_MAX_IMAGE_BYTES: 1024, MEDIA_MAX_VIDEO_BYTES: 4096 });

  beforeEach(async () => {
    storageRoot = await mkdtemp(path.join(tmpdir(), 'media-storage-test-'));
    await ensureMediaStorageDir({ MEDIA_STORAGE_PATH: storageRoot });
  });

  afterEach(async () => {
    await rm(storageRoot, { recursive: true, force: true });
  });

  /** Simulates what multer's `diskStorage` has already done before `storeUpload` runs: written
   *  the payload to a temp file beneath the configured temp subdirectory. */
  async function writeTempFile(bytes: Buffer): Promise<string> {
    const tempPath = path.join(storageRoot, MEDIA_TEMP_SUBDIR, `${Math.random().toString(36).slice(2)}`);
    await writeFile(tempPath, bytes);
    return tempPath;
  }

  it('accepts a valid image and writes it under a date-sharded path', async () => {
    const tempPath = await writeTempFile(PNG_BYTES);
    const result = await storeUpload(env(), { tempPath, sizeBytes: PNG_BYTES.length, declaredMime: 'image/png' });
    expect(result.mime).toBe('image/png');
    expect(result.sizeBytes).toBe(PNG_BYTES.length);
    expect(result.storagePath).toMatch(/^\d{4}\/\d{2}\/[0-9a-f-]{36}\.png$/);

    const onDisk = await readFile(path.join(storageRoot, result.storagePath));
    expect(onDisk.equals(PNG_BYTES)).toBe(true);
  });

  it('accepts a valid MP4 and writes it under a date-sharded path', async () => {
    const tempPath = await writeTempFile(MP4_BYTES);
    const result = await storeUpload(env(), { tempPath, sizeBytes: MP4_BYTES.length, declaredMime: 'video/mp4' });
    expect(result.mime).toBe('video/mp4');
    expect(result.storagePath).toMatch(/^\d{4}\/\d{2}\/[0-9a-f-]{36}\.mp4$/);
  });

  it('rejects a file whose type cannot be recognized, and removes the temp file', async () => {
    const tempPath = await writeTempFile(NOT_AN_IMAGE);
    await expect(
      storeUpload(env(), { tempPath, sizeBytes: NOT_AN_IMAGE.length, declaredMime: 'image/png' }),
    ).rejects.toMatchObject({ code: 'unsupported_media_type' });
    await expect(readFile(tempPath)).rejects.toThrow();
    // No dated shard directory was created — the rejection happened before anything was written
    // to a final location, and the temp directory (created by `ensureMediaStorageDir` in
    // `beforeEach`) is the only thing left under the storage root.
    expect(await readdir(storageRoot)).toEqual([MEDIA_TEMP_SUBDIR]);
  });

  it('rejects a file whose declared type disagrees with its sniffed type, and removes the temp file', async () => {
    const tempPath = await writeTempFile(JPEG_BYTES);
    await expect(
      storeUpload(env(), { tempPath, sizeBytes: JPEG_BYTES.length, declaredMime: 'image/png' }),
    ).rejects.toMatchObject({ code: 'content_type_mismatch' });
    await expect(readFile(tempPath)).rejects.toThrow();
  });

  it('rejects an image over the image maximum, and removes the temp file', async () => {
    const oversized = Buffer.concat([PNG_BYTES, Buffer.alloc(2000)]);
    const tempPath = await writeTempFile(oversized);
    await expect(
      storeUpload(env(), { tempPath, sizeBytes: oversized.length, declaredMime: 'image/png' }),
    ).rejects.toMatchObject({ code: 'file_too_large' });
    await expect(readFile(tempPath)).rejects.toThrow();
  });

  it('does not grant an image the video maximum: an oversized image is still rejected even though it is under the video limit', async () => {
    // 3000 bytes exceeds MEDIA_MAX_IMAGE_BYTES (1024) but is well under MEDIA_MAX_VIDEO_BYTES (4096).
    const oversized = Buffer.concat([PNG_BYTES, Buffer.alloc(3000)]);
    const tempPath = await writeTempFile(oversized);
    await expect(
      storeUpload(env(), { tempPath, sizeBytes: oversized.length, declaredMime: 'image/png' }),
    ).rejects.toMatchObject({ code: 'file_too_large' });
  });

  it('accepts a video within the video maximum even though it exceeds the image maximum', async () => {
    const largeVideo = Buffer.concat([MP4_BYTES, Buffer.alloc(3000)]);
    const tempPath = await writeTempFile(largeVideo);
    const result = await storeUpload(env(), {
      tempPath,
      sizeBytes: largeVideo.length,
      declaredMime: 'video/mp4',
    });
    expect(result.mime).toBe('video/mp4');
  });

  it('rejects a video over the video maximum, and removes the temp file', async () => {
    const oversized = Buffer.concat([MP4_BYTES, Buffer.alloc(5000)]);
    const tempPath = await writeTempFile(oversized);
    await expect(
      storeUpload(env(), { tempPath, sizeBytes: oversized.length, declaredMime: 'video/mp4' }),
    ).rejects.toMatchObject({ code: 'file_too_large' });
    await expect(readFile(tempPath)).rejects.toThrow();
  });

  it('rejects an empty file, and removes the temp file', async () => {
    const tempPath = await writeTempFile(Buffer.alloc(0));
    await expect(storeUpload(env(), { tempPath, sizeBytes: 0, declaredMime: 'image/png' })).rejects.toMatchObject({
      code: 'empty_file',
    });
    await expect(readFile(tempPath)).rejects.toThrow();
  });

  it('never uses the client-declared filename to build a path — a path-traversal name has no effect', async () => {
    // storeUpload never even receives a filename, only a temp file path it controls — this test
    // documents that the storage layer's API makes a traversal payload structurally inexpressible.
    const tempPath = await writeTempFile(PNG_BYTES);
    const result = await storeUpload(env(), { tempPath, sizeBytes: PNG_BYTES.length, declaredMime: 'image/png' });
    expect(result.storagePath.startsWith('..')).toBe(false);
    expect(result.storagePath).not.toContain('../');
  });
});

describe('ensureMediaStorageDir', () => {
  it('creates the storage root and the temp subdirectory when absent', async () => {
    const root = path.join(await mkdtemp(path.join(tmpdir(), 'media-ensure-test-')), 'nested', 'dir');
    await ensureMediaStorageDir({ MEDIA_STORAGE_PATH: root });
    await expect(readdir(root)).resolves.toEqual([MEDIA_TEMP_SUBDIR]);
    await rm(root, { recursive: true, force: true });
  });
});

describe('deleteStoredFile', () => {
  let storageRoot: string;
  const env = () => ({ MEDIA_STORAGE_PATH: storageRoot, MEDIA_MAX_IMAGE_BYTES: 1024, MEDIA_MAX_VIDEO_BYTES: 4096 });

  beforeEach(async () => {
    storageRoot = await mkdtemp(path.join(tmpdir(), 'media-delete-test-'));
    await ensureMediaStorageDir({ MEDIA_STORAGE_PATH: storageRoot });
  });

  afterEach(async () => {
    await rm(storageRoot, { recursive: true, force: true });
  });

  it('deletes a file that exists', async () => {
    const tempPath = path.join(storageRoot, MEDIA_TEMP_SUBDIR, 'a');
    await writeFile(tempPath, PNG_BYTES);
    const { storagePath } = await storeUpload(env(), { tempPath, sizeBytes: PNG_BYTES.length, declaredMime: 'image/png' });
    await deleteStoredFile(env(), storagePath);
    await expect(readFile(path.join(storageRoot, storagePath))).rejects.toThrow();
  });

  it('does not throw when the file is already gone', async () => {
    await expect(deleteStoredFile(env(), '2026/01/does-not-exist.png')).resolves.toBeUndefined();
  });
});
