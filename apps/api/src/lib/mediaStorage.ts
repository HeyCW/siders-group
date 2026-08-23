// Local-filesystem media storage (design.md - "Media storage: the local filesystem, not R2").
// `apps/api/src/lib/storage.ts` (the R2 presigned-upload placeholder) is deliberately not used
// by this change.

import { randomUUID } from 'node:crypto';
import { mkdir, open, rename, unlink } from 'node:fs/promises';
import path from 'node:path';
import type { MediaMimeType } from '@siders/contracts';
import { AppError } from '../middleware/errorHandler.js';

export type MediaStorageEnv = {
  MEDIA_STORAGE_PATH: string;
  MEDIA_MAX_IMAGE_BYTES: number;
  MEDIA_MAX_VIDEO_BYTES: number;
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
  kind: 'image' | 'video';
  matches: (buf: Buffer) => boolean;
}

/**
 * Subdirectory multer's `diskStorage` writes into before validation runs. Never served publicly —
 * `mediaFileRoutes` only mounts `express.static` at `MEDIA_STORAGE_PATH` after `storeUpload` has
 * already moved an accepted file out of here, but a request racing that window would otherwise be
 * able to read an unvalidated upload, so this name is also excluded from the dated-shard layout
 * `datedSubdir` produces (a `YYYY/MM` directory never collides with a literal `.tmp`).
 */
export const MEDIA_TEMP_SUBDIR = '.tmp';

/**
 * Reads the ISO base media file format's `ftyp` box major brand — the first four bytes at offset
 * 8, guarded by the literal ASCII `ftyp` at offset 4. Shared by the AVIF and MP4 signatures below,
 * because both formats use this same container; the brand is the only thing that tells them apart
 * (specs/media-management/spec.md - "Real content type is determined by inspecting file content" -
 * "A shared container is resolved by brand").
 */
function readFtypBrand(b: Buffer): string | null {
  if (b.length < 12 || b.subarray(4, 8).toString('ascii') !== 'ftyp') return null;
  return b.subarray(8, 12).toString('ascii');
}

/**
 * Major brands produced by mainstream MP4 encoders. Deliberately excludes `qt  ` (QuickTime's own
 * brand for `.mov`) — MP4-only was a deliberate choice over also accepting QuickTime or WebM
 * (openspec/changes/self-hosted-guideline-videos/proposal.md).
 */
const MP4_BRANDS = new Set([
  'isom',
  'iso2',
  'iso3',
  'iso4',
  'iso5',
  'iso6',
  'mp41',
  'mp42',
  'avc1',
  'dash',
  'M4V ',
  'M4A ',
  'M4P ',
  'M4B ',
]);

/**
 * Leading-byte signatures for the accepted types. This is the entire trust boundary for "what
 * kind of file is this" — the client's declared `Content-Type` is never consulted to decide, only
 * to be checked *against* what sniffing already found (specs/media-management/spec.md - "Real
 * content type is determined by inspecting file content").
 */
const SIGNATURES: MagicSignature[] = [
  {
    mime: 'image/jpeg',
    ext: 'jpg',
    kind: 'image',
    matches: (b) => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  },
  {
    mime: 'image/png',
    ext: 'png',
    kind: 'image',
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
    kind: 'image',
    matches: (b) =>
      b.length >= 6 &&
      b.subarray(0, 3).toString('ascii') === 'GIF' &&
      ['87a', '89a'].includes(b.subarray(3, 6).toString('ascii')),
  },
  {
    mime: 'image/webp',
    ext: 'webp',
    kind: 'image',
    matches: (b) =>
      b.length >= 12 &&
      b.subarray(0, 4).toString('ascii') === 'RIFF' &&
      b.subarray(8, 12).toString('ascii') === 'WEBP',
  },
  {
    mime: 'image/avif',
    ext: 'avif',
    kind: 'image',
    matches: (b) => {
      const brand = readFtypBrand(b);
      return brand === 'avif' || brand === 'avis';
    },
  },
  {
    mime: 'video/mp4',
    ext: 'mp4',
    kind: 'video',
    matches: (b) => {
      const brand = readFtypBrand(b);
      return brand !== null && MP4_BRANDS.has(brand);
    },
  },
];

/** Exported for direct testing of the byte-signature logic in isolation. */
export function sniffMimeType(buffer: Buffer): { mime: MediaMimeType; ext: string; kind: 'image' | 'video' } | null {
  for (const signature of SIGNATURES) {
    if (signature.matches(buffer)) return { mime: signature.mime, ext: signature.ext, kind: signature.kind };
  }
  return null;
}

export async function ensureMediaStorageDir(env: Pick<MediaStorageEnv, 'MEDIA_STORAGE_PATH'>): Promise<void> {
  await mkdir(env.MEDIA_STORAGE_PATH, { recursive: true });
  await mkdir(path.join(env.MEDIA_STORAGE_PATH, MEDIA_TEMP_SUBDIR), { recursive: true });
}

function datedSubdir(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${year}/${month}`;
}

/** How many leading bytes are read to sniff a file's type. Every signature above resolves within
 *  the first 12 bytes; 64 leaves headroom without reading any meaningful fraction of a video. */
const SNIFF_BYTES = 64;

async function readLeadingBytes(filePath: string): Promise<Buffer> {
  const handle = await open(filePath, 'r');
  try {
    const buffer = Buffer.alloc(SNIFF_BYTES);
    const { bytesRead } = await handle.read(buffer, 0, SNIFF_BYTES, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

/** Best-effort cleanup of a temp file; missing is not an error worth surfacing. */
async function removeTempFile(tempPath: string): Promise<void> {
  try {
    await unlink(tempPath);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
  }
}

/**
 * Validates and stores a file multer's `diskStorage` has already written to a temp path beneath
 * `MEDIA_STORAGE_PATH/.tmp/`. The file is never buffered into memory in full — only its leading
 * bytes are read for sniffing — so memory use does not grow with upload size
 * (specs/media-management/spec.md - "An upload is not held entirely in memory"). Every rejection
 * path removes the temp file before throwing, so a rejected upload leaves nothing behind even
 * though bytes were already written to intermediate storage
 * (specs/media-management/spec.md - "Rejected uploads leave no residue").
 */
export async function storeUpload(
  env: MediaStorageEnv,
  input: { tempPath: string; sizeBytes: number; declaredMime: string },
): Promise<StoredFile> {
  const { tempPath, sizeBytes, declaredMime } = input;

  const fail = async (message: string, status: number, code: string): Promise<never> => {
    await removeTempFile(tempPath);
    throw new AppError(message, status, code);
  };

  if (sizeBytes === 0) {
    return fail('Uploaded file is empty', 400, 'empty_file');
  }

  const leading = await readLeadingBytes(tempPath);
  const sniffed = sniffMimeType(leading);
  if (!sniffed) {
    return fail('File type is not one of the accepted types', 415, 'unsupported_media_type');
  }

  const maxBytes = sniffed.kind === 'video' ? env.MEDIA_MAX_VIDEO_BYTES : env.MEDIA_MAX_IMAGE_BYTES;
  if (sizeBytes > maxBytes) {
    return fail('File exceeds the maximum allowed size for its type', 413, 'file_too_large');
  }

  if (declaredMime && declaredMime !== sniffed.mime) {
    return fail("Declared content type does not match the file's actual content", 415, 'content_type_mismatch');
  }

  const subdir = datedSubdir(new Date());
  const filename = `${randomUUID()}.${sniffed.ext}`;
  const absoluteDir = path.join(env.MEDIA_STORAGE_PATH, subdir);
  await mkdir(absoluteDir, { recursive: true });

  const finalPath = path.join(absoluteDir, filename);
  try {
    await rename(tempPath, finalPath);
  } catch (err) {
    await removeTempFile(tempPath);
    throw err;
  }

  return { storagePath: `${subdir}/${filename}`, mime: sniffed.mime, sizeBytes };
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
