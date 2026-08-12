// Local-filesystem media storage (design.md - "Media storage: the local filesystem, not R2").
// `apps/api/src/lib/storage.ts` (the R2 presigned-upload placeholder) is deliberately not used
// by this change.

import { randomUUID } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { MediaMimeType } from '@siders/contracts';
import { AppError } from '../middleware/errorHandler.js';

export type MediaStorageEnv = {
  MEDIA_STORAGE_PATH: string;
  MEDIA_MAX_BYTES: number;
};

export interface StoredFile {
  /** Relative to `MEDIA_STORAGE_PATH`, e.g. `2026/08/<uuid>.webp`. Never an absolute URL. */
  storagePath: string;
  mime: MediaMimeType;
  sizeBytes: number;
}

interface MagicSignature {
  mime: MediaMimeType;
  ext: string;
  matches: (buf: Buffer) => boolean;
}

/**
 * Leading-byte signatures for the accepted image types. This is the entire trust boundary for
 * "what kind of file is this" — the client's declared `Content-Type` is never consulted to
 * decide, only to be checked *against* what sniffing already found
 * (specs/media-management/spec.md - "Real content type is determined by inspecting file
 * content").
 */
const SIGNATURES: MagicSignature[] = [
  {
    mime: 'image/jpeg',
    ext: 'jpg',
    matches: (b) => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  },
  {
    mime: 'image/png',
    ext: 'png',
    matches: (b) =>
      b.length >= 8 &&
      b[0] === 0x89 &&
      b[1] === 0x50 &&
      b[2] === 0x4e &&
      b[3] === 0x47 &&
      b[4] === 0x0d &&
      b[5] === 0x0a &&
      b[6] === 0x1a &&
      b[7] === 0x0a,
  },
  {
    mime: 'image/gif',
    ext: 'gif',
    matches: (b) =>
      b.length >= 6 &&
      b.subarray(0, 3).toString('ascii') === 'GIF' &&
      ['87a', '89a'].includes(b.subarray(3, 6).toString('ascii')),
  },
  {
    mime: 'image/webp',
    ext: 'webp',
    matches: (b) =>
      b.length >= 12 &&
      b.subarray(0, 4).toString('ascii') === 'RIFF' &&
      b.subarray(8, 12).toString('ascii') === 'WEBP',
  },
  {
    mime: 'image/avif',
    ext: 'avif',
    matches: (b) => {
      if (b.length < 12 || b.subarray(4, 8).toString('ascii') !== 'ftyp') return false;
      const brand = b.subarray(8, 12).toString('ascii');
      return brand === 'avif' || brand === 'avis';
    },
  },
];

/** Exported for direct testing of the byte-signature logic in isolation. */
export function sniffMimeType(buffer: Buffer): { mime: MediaMimeType; ext: string } | null {
  for (const signature of SIGNATURES) {
    if (signature.matches(buffer)) return { mime: signature.mime, ext: signature.ext };
  }
  return null;
}

export async function ensureMediaStorageDir(env: Pick<MediaStorageEnv, 'MEDIA_STORAGE_PATH'>): Promise<void> {
  await mkdir(env.MEDIA_STORAGE_PATH, { recursive: true });
}

function datedSubdir(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${year}/${month}`;
}

/**
 * Validates and writes an uploaded buffer beneath `MEDIA_STORAGE_PATH`. Every rejection throws
 * before any file is written, so a rejected upload leaves nothing on disk
 * (specs/media-management/spec.md - "Rejected uploads leave no residue"). The stored filename
 * is always server-generated (`randomUUID()` + the *sniffed* extension) and the client-supplied
 * filename never becomes part of a path — `path.join` on a fixed root plus a generated segment
 * makes traversal structurally unreachable rather than merely filtered
 * (specs/media-management/spec.md - "Path traversal attempt is structurally impossible").
 */
export async function storeUpload(
  env: MediaStorageEnv,
  input: { buffer: Buffer; declaredMime: string },
): Promise<StoredFile> {
  if (input.buffer.length === 0) {
    throw new AppError('Uploaded file is empty', 400, 'empty_file');
  }
  if (input.buffer.length > env.MEDIA_MAX_BYTES) {
    throw new AppError('File exceeds the maximum allowed size', 413, 'file_too_large');
  }

  const sniffed = sniffMimeType(input.buffer);
  if (!sniffed) {
    throw new AppError('File type is not one of the accepted image types', 415, 'unsupported_media_type');
  }
  if (input.declaredMime && input.declaredMime !== sniffed.mime) {
    throw new AppError(
      "Declared content type does not match the file's actual content",
      415,
      'content_type_mismatch',
    );
  }

  const subdir = datedSubdir(new Date());
  const filename = `${randomUUID()}.${sniffed.ext}`;
  const absoluteDir = path.join(env.MEDIA_STORAGE_PATH, subdir);

  await mkdir(absoluteDir, { recursive: true });
  await writeFile(path.join(absoluteDir, filename), input.buffer, { flag: 'wx' });

  return { storagePath: `${subdir}/${filename}`, mime: sniffed.mime, sizeBytes: input.buffer.length };
}

/** Composed at map time, never stored — moving hosts or storage backends is a config change. */
export function publicUrlFor(env: { MEDIA_PUBLIC_BASE_URL: string }, storagePath: string): string {
  return `${env.MEDIA_PUBLIC_BASE_URL}/${storagePath}`;
}

/** Best-effort cleanup; a file that is already gone is not an error worth surfacing. */
export async function deleteStoredFile(env: MediaStorageEnv, storagePath: string): Promise<void> {
  try {
    await unlink(path.join(env.MEDIA_STORAGE_PATH, storagePath));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
  }
}
