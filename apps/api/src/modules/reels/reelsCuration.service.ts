import type { ReelsCurationEntryResponse } from '@siders/contracts';
import { revalidateHomePath, type RevalidateEnv } from '../../lib/revalidate.js';
import type { Logger } from '../../lib/logger.js';
import type { ReelsCurationRepository } from './reelsCuration.repository.js';
import { toReelsCurationEntryResponse } from './reelsCuration.mapper.js';

type MediaUrlEnv = { MEDIA_PUBLIC_BASE_URL: string };

export interface ReelsCurationService {
  list(): Promise<ReelsCurationEntryResponse[]>;
  /**
   * Whole-list replacement (specs/reels-curation/spec.md - "The ordering is replaced as a whole
   * list"). Revalidates `/` and only `/`, same scope as `HomeCurationService.replace`
   * (specs/reels-curation/spec.md - "Reels writes revalidate the homepage").
   */
  replace(reelIds: string[]): Promise<ReelsCurationEntryResponse[]>;
}

export function createReelsCurationService(
  repository: ReelsCurationRepository,
  revalidateEnv: RevalidateEnv,
  mediaEnv: MediaUrlEnv,
  logger: Logger,
): ReelsCurationService {
  return {
    async list() {
      const rows = await repository.list();
      return rows.map((row) => toReelsCurationEntryResponse(mediaEnv, row));
    },

    async replace(reelIds) {
      const rows = await repository.replace(reelIds);
      await revalidateHomePath(revalidateEnv, logger);
      return rows.map((row) => toReelsCurationEntryResponse(mediaEnv, row));
    },
  };
}
