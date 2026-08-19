import { AppError } from '../../middleware/errorHandler.js';
import { isForeignKeyViolation } from '../../lib/pgErrors.js';
import { revalidateHomePath, type RevalidateEnv } from '../../lib/revalidate.js';
import type { Logger } from '../../lib/logger.js';
import type {
  CreateGuidePickInput,
  GuidePickRepository,
  GuidePickRow,
  UpdateGuidePickInput,
} from './guidePick.repository.js';

export interface GuidePickService {
  create(input: CreateGuidePickInput): Promise<GuidePickRow>;
  list(): Promise<GuidePickRow[]>;
  update(id: string, input: UpdateGuidePickInput): Promise<GuidePickRow>;
  delete(id: string): Promise<void>;
  reorder(guidePickIds: string[]): Promise<GuidePickRow[]>;
}

function invalidPhotoMediaError(): AppError {
  return new AppError('photoMediaId does not reference an existing media item', 400, 'invalid_photo_media');
}

/**
 * Every admin write revalidates `/` unconditionally, mirroring `partner.service.ts` — a guide
 * pick has no non-visible-but-stored state for an edit to be indifferent to: every field on the
 * row (city, place, description, photo, active flag, order) is either shown or governs whether
 * the row is shown at all.
 */
export function createGuidePickService(
  repository: GuidePickRepository,
  revalidateEnv: RevalidateEnv,
  logger: Logger,
): GuidePickService {
  return {
    async create(input) {
      let row: GuidePickRow;
      try {
        row = await repository.create(input);
      } catch (err) {
        if (isForeignKeyViolation(err)) throw invalidPhotoMediaError();
        throw err;
      }
      await revalidateHomePath(revalidateEnv, logger);
      return row;
    },

    list() {
      return repository.list();
    },

    async update(id, input) {
      const existing = await repository.findById(id);
      if (!existing) throw new AppError('Guide pick not found', 404, 'not_found');
      let updated: GuidePickRow;
      try {
        updated = await repository.update(id, input);
      } catch (err) {
        if (isForeignKeyViolation(err)) throw invalidPhotoMediaError();
        throw err;
      }
      await revalidateHomePath(revalidateEnv, logger);
      return updated;
    },

    async delete(id) {
      const existing = await repository.findById(id);
      if (!existing) throw new AppError('Guide pick not found', 404, 'not_found');
      await repository.delete(id);
      await revalidateHomePath(revalidateEnv, logger);
    },

    async reorder(guidePickIds) {
      const rows = await repository.reorder(guidePickIds);
      await revalidateHomePath(revalidateEnv, logger);
      return rows;
    },
  };
}

export interface PublicGuidePickService {
  listPublic(): Promise<GuidePickRow[]>;
}

/**
 * The public listing needs no `RevalidateEnv` or `Logger` — it never writes — so it gets its own
 * minimal service rather than sharing `GuidePickService`, mirroring
 * `createPublicPartnerService` alongside `createPartnerService`.
 */
export function createPublicGuidePickService(repository: GuidePickRepository): PublicGuidePickService {
  return {
    listPublic() {
      return repository.listActiveOrdered();
    },
  };
}
