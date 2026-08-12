import type { HomeCurationEntryResponse } from '@siders/contracts';
import { revalidateHomePath, type RevalidateEnv } from '../../lib/revalidate.js';
import type { Logger } from '../../lib/logger.js';
import type { HomeCurationRepository } from './curation.repository.js';
import { toHomeCurationEntryResponse } from './curation.mapper.js';

export interface HomeCurationService {
  list(): Promise<HomeCurationEntryResponse[]>;
  /**
   * Whole-list replacement (specs/home-curation/spec.md - "Curation is replaced as a whole
   * list"). Revalidates `/` and only `/` — no article's own page changed, and `/news` does not
   * show curation (specs/home-curation/spec.md - "Curation writes revalidate the homepage").
   */
  replace(articleIds: string[]): Promise<HomeCurationEntryResponse[]>;
}

export function createHomeCurationService(
  repository: HomeCurationRepository,
  revalidateEnv: RevalidateEnv,
  logger: Logger,
): HomeCurationService {
  return {
    async list() {
      const rows = await repository.list();
      const now = new Date();
      return rows.map((row) => toHomeCurationEntryResponse(row, now));
    },

    async replace(articleIds) {
      const rows = await repository.replace(articleIds);
      await revalidateHomePath(revalidateEnv, logger);
      const now = new Date();
      return rows.map((row) => toHomeCurationEntryResponse(row, now));
    },
  };
}
