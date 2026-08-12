import { asc, eq, sql } from 'drizzle-orm';
import { media, reels, reelsCuration, type Database } from '@siders/db';
import type { ReelProvider, ReelStatus } from '@siders/contracts';
import { AppError } from '../../middleware/errorHandler.js';
import { isForeignKeyViolation } from '../../lib/pgErrors.js';

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

type Executor = Database | Parameters<Parameters<Database['transaction']>[0]>[0];

async function selectJoined(executor: Executor): Promise<ReelsCurationEntryRow[]> {
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
 * Reuses, verbatim, the lock ordering `add-home-curation` discovered empirically against live
 * Postgres 16 for the structurally identical `home_curation` table: row locks on the referenced
 * entities first (`FOR KEY SHARE`), then the table lock, then delete-and-reinsert
 * (openspec/changes/add-reels-curation/design.md - "Writes replace the whole ordering, and
 * reuse the lock ordering `add-home-curation` paid for"). See `curation.repository.ts`'s
 * `replace` for the full account of both failure modes this ordering avoids — a `40P01`
 * deadlock against a concurrent delete of a submitted reel if the table lock is taken first,
 * and a `23505` from two overlapping replaces if the table lock is omitted entirely.
 */
export function createReelsCurationRepository(db: Database): ReelsCurationRepository {
  return {
    list() {
      return selectJoined(db);
    },

    async replace(reelIds) {
      try {
        return await db.transaction(async (tx) => {
          if (reelIds.length > 0) {
            const rows = await tx.execute(sql`
              select id from app.reels
              where id in (${sql.join(
                reelIds.map((id) => sql`${id}`),
                sql`, `,
              )})
              for key share
            `);
            if (rows.rows.length !== reelIds.length) throw invalidReelReferenceError();
          }
          await tx.execute(sql`LOCK TABLE app.reels_curation IN EXCLUSIVE MODE`);
          await tx.delete(reelsCuration);
          if (reelIds.length > 0) {
            await tx.insert(reelsCuration).values(reelIds.map((reelId, position) => ({ reelId, position })));
          }
          return selectJoined(tx);
        });
      } catch (err) {
        if (err instanceof AppError) throw err;
        if (isForeignKeyViolation(err)) throw invalidReelReferenceError();
        throw err;
      }
    },
  };
}
