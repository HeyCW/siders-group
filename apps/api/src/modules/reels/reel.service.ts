import { parseReelUrl } from '@siders/contracts';
import { AppError } from '../../middleware/errorHandler.js';
import { isForeignKeyViolation, isUniqueViolationOn } from '../../lib/pgErrors.js';
import { revalidateHomePath, type RevalidateEnv } from '../../lib/revalidate.js';
import type { Logger } from '../../lib/logger.js';
import { isReelPubliclyVisible, type ReelRepository, type ReelRow, type UpdateReelInput } from './reel.repository.js';

export interface CreateReelServiceInput {
  url: string;
  posterMediaId: string;
  caption: string | null;
}

export interface ReelService {
  create(input: CreateReelServiceInput): Promise<ReelRow>;
  get(id: string): Promise<ReelRow>;
  list(): Promise<ReelRow[]>;
  update(id: string, input: UpdateReelInput): Promise<ReelRow>;
  delete(id: string): Promise<void>;
}

function invalidReelUrlError(): AppError {
  return new AppError('URL does not match any recognized provider', 400, 'invalid_reel_url');
}

function invalidPosterMediaError(): AppError {
  return new AppError('posterMediaId does not reference an existing media item', 400, 'invalid_poster_media');
}

function duplicateReelError(): AppError {
  return new AppError('This video is already in the reel library', 409, 'duplicate_reel');
}

/**
 * The URL is parsed once, here, at the single entry point through which a reel is created.
 * Only the resulting `(provider, externalId)` reaches the repository — the submitted URL string
 * itself is discarded after this call and never persisted
 * (specs/reels-curation/spec.md - "Only a provider identity is persisted").
 *
 * Revalidates `/` whenever a reel's status write crosses the publicly-visible boundary, or when
 * a currently-published reel is deleted — the same trigger `HomeCurationService.replace` uses
 * for the ordering write, extended here to the reel's own lifecycle
 * (specs/reels-curation/spec.md - "Reels writes revalidate the homepage" - "A status change
 * revalidates the homepage"). A reel that was never published cannot have changed public output
 * by being edited or deleted, so no revalidation call is made for it.
 */
export function createReelService(
  repository: ReelRepository,
  revalidateEnv: RevalidateEnv,
  logger: Logger,
): ReelService {
  return {
    async create(input) {
      const parsed = parseReelUrl(input.url);
      if (!parsed) throw invalidReelUrlError();

      try {
        return await repository.create({
          provider: parsed.provider,
          externalId: parsed.externalId,
          posterMediaId: input.posterMediaId,
          caption: input.caption,
        });
      } catch (err) {
        if (isUniqueViolationOn(err, 'reels_provider_external_id_unique')) throw duplicateReelError();
        if (isForeignKeyViolation(err)) throw invalidPosterMediaError();
        throw err;
      }
    },

    async get(id) {
      const row = await repository.findById(id);
      if (!row) throw new AppError('Reel not found', 404, 'not_found');
      return row;
    },

    list() {
      return repository.list();
    },

    async update(id, input) {
      const existing = await repository.findById(id);
      if (!existing) throw new AppError('Reel not found', 404, 'not_found');
      let updated: ReelRow;
      try {
        updated = await repository.update(id, input);
      } catch (err) {
        if (isForeignKeyViolation(err)) throw invalidPosterMediaError();
        throw err;
      }
      // Gated on "was it already public *or* is it public now", not on the boundary changing —
      // a caption or poster edit on an already-published reel is itself a change to public
      // output (both fields are in `PublicReelItem`), so it must also revalidate even though
      // visibility didn't cross. Mirrors `article.service.ts`'s `isPubliclyVisible(existing, ...)`
      // gate for the identical case.
      if (isReelPubliclyVisible(existing.status) || isReelPubliclyVisible(updated.status)) {
        await revalidateHomePath(revalidateEnv, logger);
      }
      return updated;
    },

    async delete(id) {
      const existing = await repository.findById(id);
      if (!existing) throw new AppError('Reel not found', 404, 'not_found');
      await repository.delete(id);
      if (isReelPubliclyVisible(existing.status)) {
        await revalidateHomePath(revalidateEnv, logger);
      }
    },
  };
}
