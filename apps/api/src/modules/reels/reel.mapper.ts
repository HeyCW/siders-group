import type { ReelResponse } from '@siders/contracts';
import { publicUrlFor } from '../../lib/mediaStorage.js';
import type { ReelRow } from './reel.repository.js';

/** `posterUrl` is derived from the joined media's `storage_path` here, at map time — never
 *  stored on the row, matching how `media.mapper.ts` derives `url`. `null` when the reel has no
 *  poster, rather than calling `publicUrlFor` on a storage path that doesn't exist. No `url` field
 *  for the reel's own source video is ever produced, because none is ever stored
 *  (specs/reels-curation/spec.md - "Only a provider identity is persisted"). */
export function toReelResponse(env: { MEDIA_PUBLIC_BASE_URL: string }, row: ReelRow): ReelResponse {
  return {
    id: row.id,
    provider: row.provider,
    externalId: row.externalId,
    posterUrl: row.posterStoragePath ? publicUrlFor(env, row.posterStoragePath) : null,
    caption: row.caption,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
