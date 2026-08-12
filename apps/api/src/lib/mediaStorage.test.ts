import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { deleteStoredFile, ensureMediaStorageDir, sniffMimeType, storeUpload } from './mediaStorage.js';

const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const JPEG_BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]);
const GIF_BYTES = Buffer.from('GIF89a' + 'x'.repeat(10), 'ascii');
const WEBP_BYTES = Buffer.concat([Buffer.from('RIFF', 'ascii'), Buffer.from([0, 0, 0, 0]), Buffer.from('WEBP', 'ascii')]);
const AVIF_BYTES = Buffer.concat([Buffer.from([0, 0, 0, 0]), Buffer.from('ftyp', 'ascii'), Buffer.from('avif', 'ascii')]);
const NOT_AN_IMAGE = Buffer.from('%PDF-1.4 this is a pdf, not an image', 'ascii');

describe('sniffMimeType', () => {
  it('recognizes every accepted image type by its leading bytes', () => {
    expect(sniffMimeType(PNG_BYTES)?.mime).toBe('image/png');
    expect(sniffMimeType(JPEG_BYTES)?.mime).toBe('image/jpeg');
    expect(sniffMimeType(GIF_BYTES)?.mime).toBe('image/gif');
    expect(sniffMimeType(WEBP_BYTES)?.mime).toBe('image/webp');
    expect(sniffMimeType(AVIF_BYTES)?.mime).toBe('image/avif');
  });

  it('returns null for a non-image buffer', () => {
    expect(sniffMimeType(NOT_AN_IMAGE)).toBeNull();
  });
});

describe('storeUpload', () => {
  let storageRoot: string;
  const env = () => ({ MEDIA_STORAGE_PATH: storageRoot, MEDIA_MAX_BYTES: 1024 });

  beforeEach(async () => {
    storageRoot = await mkdtemp(path.join(tmpdir(), 'media-storage-test-'));
  });

  afterEach(async () => {
    await rm(storageRoot, { recursive: true, force: true });
  });

  it('accepts a valid image and writes it under a date-sharded path', async () => {
    const result = await storeUpload(env(), { buffer: PNG_BYTES, declaredMime: 'image/png' });
    expect(result.mime).toBe('image/png');
    expect(result.sizeBytes).toBe(PNG_BYTES.length);
    expect(result.storagePath).toMatch(/^\d{4}\/\d{2}\/[0-9a-f-]{36}\.png$/);

    const onDisk = await readFile(path.join(storageRoot, result.storagePath));
    expect(onDisk.equals(PNG_BYTES)).toBe(true);
  });

  it('rejects a file whose type cannot be recognized, and writes nothing', async () => {
    await expect(storeUpload(env(), { buffer: NOT_AN_IMAGE, declaredMime: 'image/png' })).rejects.toMatchObject({
      code: 'unsupported_media_type',
    });
    expect(await readdir(storageRoot)).toHaveLength(0);
  });

  it('rejects a file whose declared type disagrees with its sniffed type', async () => {
    await expect(storeUpload(env(), { buffer: JPEG_BYTES, declaredMime: 'image/png' })).rejects.toMatchObject({
      code: 'content_type_mismatch',
    });
    expect(await readdir(storageRoot)).toHaveLength(0);
  });

  it('rejects a file over the configured maximum size, and writes nothing', async () => {
    const oversized = Buffer.concat([PNG_BYTES, Buffer.alloc(2000)]);
    await expect(storeUpload(env(), { buffer: oversized, declaredMime: 'image/png' })).rejects.toMatchObject({
      code: 'file_too_large',
    });
    expect(await readdir(storageRoot)).toHaveLength(0);
  });

  it('rejects an empty buffer', async () => {
    await expect(storeUpload(env(), { buffer: Buffer.alloc(0), declaredMime: 'image/png' })).rejects.toMatchObject({
      code: 'empty_file',
    });
  });

  it('never uses the client-declared filename to build a path — a path-traversal name has no effect', async () => {
    // storeUpload never even receives a filename, only a buffer — this test documents that
    // the storage layer's API makes a traversal payload structurally inexpressible.
    const result = await storeUpload(env(), { buffer: PNG_BYTES, declaredMime: 'image/png' });
    expect(result.storagePath.startsWith('..')).toBe(false);
    expect(result.storagePath).not.toContain('../');
  });
});

describe('ensureMediaStorageDir', () => {
  it('creates the storage root when absent', async () => {
    const root = path.join(await mkdtemp(path.join(tmpdir(), 'media-ensure-test-')), 'nested', 'dir');
    await ensureMediaStorageDir({ MEDIA_STORAGE_PATH: root });
    await expect(readdir(root)).resolves.toEqual([]);
    await rm(root, { recursive: true, force: true });
  });
});

describe('deleteStoredFile', () => {
  let storageRoot: string;

  beforeEach(async () => {
    storageRoot = await mkdtemp(path.join(tmpdir(), 'media-delete-test-'));
  });

  afterEach(async () => {
    await rm(storageRoot, { recursive: true, force: true });
  });

  it('deletes a file that exists', async () => {
    const env = { MEDIA_STORAGE_PATH: storageRoot, MEDIA_MAX_BYTES: 1024 };
    const { storagePath } = await storeUpload(env, { buffer: PNG_BYTES, declaredMime: 'image/png' });
    await deleteStoredFile(env, storagePath);
    await expect(readFile(path.join(storageRoot, storagePath))).rejects.toThrow();
  });

  it('does not throw when the file is already gone', async () => {
    const env = { MEDIA_STORAGE_PATH: storageRoot, MEDIA_MAX_BYTES: 1024 };
    await expect(deleteStoredFile(env, '2026/01/does-not-exist.png')).resolves.toBeUndefined();
  });
});
