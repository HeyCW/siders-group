import type { PublicReelItem } from '@siders/contracts';
import { isReelPubliclyVisible } from './reel.repository.js';
import type { ReelsCurationRepository } from './reelsCuration.repository.js';
import { toPublicReelItem } from './reelsCuration.mapper.js';

type MediaUrlEnv = { MEDIA_PUBLIC_BASE_URL: string };

export interface PublicReelsService {
  /**
   * Publicly visible reels, in stored order — nothing else. Unlike the homepage article feed,
   * there is no chronological backfill: a short ordering stays short, and an empty ordering
   * returns an empty array rather than falling back to "recently added" reels, which would carry
   * no editorial signal (specs/reels-curation/spec.md - "The rail is not backfilled").
   */
  getRail(): Promise<PublicReelItem[]>;
}

export function createPublicReelsService(repository: ReelsCurationRepository, env: MediaUrlEnv): PublicReelsService {
  return {
    async getRail() {
      const entries = await repository.list();
      return entries.filter((entry) => isReelPubliclyVisible(entry.status)).map((entry) => toPublicReelItem(env, entry));
    },
  };
}
