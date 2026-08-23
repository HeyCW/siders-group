import { AppError } from '../../middleware/errorHandler.js';
import { isForeignKeyViolation } from '../../lib/pgErrors.js';
import { revalidateHomePath, type RevalidateEnv } from '../../lib/revalidate.js';
import type { Logger } from '../../lib/logger.js';
import type {
  CreatePartnerInput,
  PartnerRepository,
  PartnerRow,
  UpdatePartnerInput,
} from './partner.repository.js';

export interface PartnerService {
  create(input: CreatePartnerInput): Promise<PartnerRow>;
  list(): Promise<PartnerRow[]>;
  update(id: string, input: UpdatePartnerInput): Promise<PartnerRow>;
  delete(id: string): Promise<void>;
  reorder(partnerIds: string[]): Promise<PartnerRow[]>;
}

function invalidLogoMediaError(): AppError {
  return new AppError('logoMediaId does not reference an existing media item', 400, 'invalid_logo_media');
}

/**
 * Every admin write revalidates `/` unconditionally (specs/partner-management/spec.md - "Partner
 * writes revalidate the home page") — a partner has no non-visible-but-stored state for an edit to
 * be indifferent to: every field on the row (name, logo, url, active flag, order) is either shown
 * or governs whether the row is shown at all.
 */
export function createPartnerService(
  repository: PartnerRepository,
  revalidateEnv: RevalidateEnv,
  logger: Logger,
): PartnerService {
  return {
    async create(input) {
      let row: PartnerRow;
      try {
        row = await repository.create(input);
      } catch (err) {
        if (isForeignKeyViolation(err)) throw invalidLogoMediaError();
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
      if (!existing) throw new AppError('Partner not found', 404, 'not_found');
      let updated: PartnerRow;
      try {
        updated = await repository.update(id, input);
      } catch (err) {
        if (isForeignKeyViolation(err)) throw invalidLogoMediaError();
        throw err;
      }
      await revalidateHomePath(revalidateEnv, logger);
      return updated;
    },

    async delete(id) {
      const existing = await repository.findById(id);
      if (!existing) throw new AppError('Partner not found', 404, 'not_found');
      await repository.delete(id);
      await revalidateHomePath(revalidateEnv, logger);
    },

    async reorder(partnerIds) {
      const rows = await repository.reorder(partnerIds);
      await revalidateHomePath(revalidateEnv, logger);
      return rows;
    },
  };
}

export interface PublicPartnerService {
  listPublic(): Promise<PartnerRow[]>;
}

/**
 * The public listing needs no `RevalidateEnv` or `Logger` — it never writes — so it gets its own
 * minimal service rather than sharing `PartnerService`, mirroring `createPublicGuidePickService`
 * alongside `createGuidePickService` (guidePick.service.ts).
 */
export function createPublicPartnerService(repository: PartnerRepository): PublicPartnerService {
  return {
    listPublic() {
      return repository.listActiveOrdered();
    },
  };
}
