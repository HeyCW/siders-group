import { asc, eq } from 'drizzle-orm';
import { media, reels, reelsCuration, type Database } from '@siders/db';
import type { ReelProvider, ReelStatus } from '@siders/contracts';
import { AppError } from '../../middleware/errorHandler.js';
import { replaceOrdering, type OrderingExecutor } from '../../lib/replaceOrdering.js';

export interface ReelsCurationEntryRow {
  reelId: string;
  position: number;
  provider: ReelProvider;
  externalId: string;
  posterStoragePath: string;
  caption: string | null;
  status: ReelStatus;
}

export interface ReelsCurationRepository {
  /** Every stored entry, in position order, joined with enough of the reel to report status,
   *  visibility, and enough to render an admin summary row. */
  list(): Promise<ReelsCurationEntryRow[]>;
  /**
   * Whole-list replacement in a single transaction: delete every existing row, then insert one
   * row per id with `position` set to its index in `reelIds`
   * (specs/reels-curation/spec.md - "The ordering is replaced as a whole list"). An id that
   * names no reel throws `invalid_reel_reference`; the previous ordering is left untouched.
   */
  replace(reelIds: string[]): Promise<ReelsCurationEntryRow[]>;
}

function invalidReelReferenceError(): AppError {
  return new AppError('One or more reel ids do not exist', 400, 'invalid_reel_reference');
}

async function selectJoined(executor: OrderingExecutor): Promise<ReelsCurationEntryRow[]> {
  return executor
    .select({
      reelId: reelsCuration.reelId,
      position: reelsCuration.position,
      provider: reels.provider,
      externalId: reels.externalId,
      posterStoragePath: media.storagePath,
      caption: reels.caption,
      status: reels.status,
    })
    .from(reelsCuration)
    .innerJoin(reels, eq(reels.id, reelsCuration.reelId))
    .innerJoin(media, eq(media.id, reels.posterMediaId))
    .orderBy(asc(reelsCuration.position));
}

/**
 * Reuses, via the shared `replaceOrdering` helper, the lock ordering `add-home-curation`
 * discovered empirically against live Postgres 16 for the structurally identical `home_curation`
 * table (openspec/changes/add-reels-curation/design.md - "Writes replace the whole ordering, and
 * reuse the lock ordering `add-home-curation` paid for"). See `replaceOrdering`'s doc comment for
 * the full account of both failure modes this ordering avoids — a `40P01` deadlock against a
 * concurrent delete of a submitted reel if the table lock is taken first, and a `23505` from two
 * overlapping replaces if the table lock is omitted entirely.
 */
export function createReelsCurationRepository(db: Database): ReelsCurationRepository {
  return {
    list() {
      return selectJoined(db);
    },

    replace(reelIds) {
      return replaceOrdering({
        db,
        ids: reelIds,
        referencedTable: 'app.reels',
        orderingTable: 'app.reels_curation',
        deleteAll: (tx) => tx.delete(reelsCuration),
        insertOrdered: (tx, ids) => tx.insert(reelsCuration).values(ids.map((reelId, position) => ({ reelId, position }))),
        selectJoined,
        onInvalidReference: invalidReelReferenceError,
      });
    },
  };
}
