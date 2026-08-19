import type { PublicReelItem, ReelsCurationEntryResponse } from '@siders/contracts';
import { publicUrlFor } from '../../lib/mediaStorage.js';
import { isReelPubliclyVisible } from './reel.repository.js';
import type { ReelsCurationEntryRow } from './reelsCuration.repository.js';

type MediaUrlEnv = { MEDIA_PUBLIC_BASE_URL: string };

export function toReelsCurationEntryResponse(
  env: MediaUrlEnv,
  entry: ReelsCurationEntryRow,
): ReelsCurationEntryResponse {
  return {
    reel: {
      id: entry.reelId,
      provider: entry.provider,
      externalId: entry.externalId,
      posterUrl: entry.posterStoragePath ? publicUrlFor(env, entry.posterStoragePath) : null,
      caption: entry.caption,
    },
    status: entry.status,
    position: entry.position,
    isPubliclyVisible: isReelPubliclyVisible(entry.status),
  };
}

/** No HTML, no iframe, no embed URL — structured fields only
 *  (specs/reels-curation/spec.md - "Public reels endpoint serves structured data"). */
export function toPublicReelItem(env: MediaUrlEnv, entry: ReelsCurationEntryRow): PublicReelItem {
  return {
    provider: entry.provider,
    externalId: entry.externalId,
    posterUrl: entry.posterStoragePath ? publicUrlFor(env, entry.posterStoragePath) : null,
    caption: entry.caption,
  };
}
