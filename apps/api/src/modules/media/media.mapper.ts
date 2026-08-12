import type { MediaResponse } from '@siders/contracts';
import { publicUrlFor } from '../../lib/mediaStorage.js';
import type { MediaRow } from './media.repository.js';

/** `url` is derived from `storage_path` here, at map time — never stored on the row. */
export function toMediaResponse(env: { MEDIA_PUBLIC_BASE_URL: string }, row: MediaRow): MediaResponse {
  return {
    id: row.id,
    url: publicUrlFor(env, row.storagePath),
    mime: row.mime as MediaResponse['mime'],
    sizeBytes: row.sizeBytes,
    originalFilename: row.originalFilename,
    alt: row.alt,
    caption: row.caption,
    createdAt: row.createdAt.toISOString(),
  };
}
