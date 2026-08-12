import { desc, eq, inArray } from 'drizzle-orm';
import { media, reels, type Database } from '@siders/db';
import type { ReelProvider, ReelStatus } from '@siders/contracts';
import { stripUndefined } from '../../lib/stripUndefined.js';

export interface ReelRow {
  id: string;
  provider: ReelProvider;
  externalId: string;
  posterMediaId: string;
  /** Joined from `app.media` at read time so the mapper can derive a poster URL without a
   *  second round trip — mirrors `HomeCurationEntryRow` joining in the article title/slug it
   *  needs to render (curation.repository.ts). */
  posterStoragePath: string;
  caption: string | null;
  status: ReelStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateReelInput {
  provider: ReelProvider;
  externalId: string;
  posterMediaId: string;
  caption: string | null;
}

export interface UpdateReelInput {
  posterMediaId?: string | undefined;
  caption?: string | null | undefined;
  status?: ReelStatus | undefined;
}

const SELECT_COLUMNS = {
  id: reels.id,
  provider: reels.provider,
  externalId: reels.externalId,
  posterMediaId: reels.posterMediaId,
  posterStoragePath: media.storagePath,
  caption: reels.caption,
  status: reels.status,
  createdAt: reels.createdAt,
  updatedAt: reels.updatedAt,
};

/** Drizzle queries only — no Express types here, mirroring `media.repository.ts`. */
export interface ReelRepository {
  create(input: CreateReelInput): Promise<ReelRow>;
  findById(id: string): Promise<ReelRow | null>;
  /** Every reel, newest first — unpaginated. The reels library is small and hand-curated by
   *  design (openspec/changes/add-reels-curation/design.md - "The rail is not backfilled"),
   *  matching the unpaginated `list()` already used for the similarly small, editorial
   *  `categories` and `tags` tables rather than the offset/limit shape article listing needs. */
  list(): Promise<ReelRow[]>;
  update(id: string, input: UpdateReelInput): Promise<ReelRow>;
  delete(id: string): Promise<void>;
  /** Used by the ordering write path's existence check (curation.repository.ts's `FOR KEY
   *  SHARE` pattern) and by public visibility filtering; kept here since it is a plain read
   *  against `reels`, not `reels_curation`. */
  findManyByIds(ids: string[]): Promise<ReelRow[]>;
}

/**
 * The entire reel visibility rule: `published`, and nothing else. Unlike articles there is no
 * `scheduled`-with-a-future-timestamp case to account for — a reel has no publication schedule
 * (specs/reels-curation/spec.md - "Reel status governs public visibility"). Exported so
 * `reelsCuration.mapper.ts` and the public reels service share this one definition rather than
 * re-deriving it, the same discipline `isPubliclyVisible` in `article.repository.ts` established
 * for articles.
 */
export function isReelPubliclyVisible(status: ReelStatus): boolean {
  return status === 'published';
}

export function createReelRepository(db: Database): ReelRepository {
  async function findByIdJoined(id: string): Promise<ReelRow | null> {
    const [row] = await db
      .select(SELECT_COLUMNS)
      .from(reels)
      .innerJoin(media, eq(media.id, reels.posterMediaId))
      .where(eq(reels.id, id))
      .limit(1);
    return row ?? null;
  }

  return {
    async create(input) {
      const [inserted] = await db.insert(reels).values(input).returning({ id: reels.id });
      if (!inserted) throw new Error('reel insert returned no row');
      const row = await findByIdJoined(inserted.id);
      if (!row) throw new Error('reel missing immediately after insert');
      return row;
    },

    findById: findByIdJoined,

    async list() {
      return db
        .select(SELECT_COLUMNS)
        .from(reels)
        .innerJoin(media, eq(media.id, reels.posterMediaId))
        .orderBy(desc(reels.createdAt));
    },

    async update(id, input) {
      const [updated] = await db
        .update(reels)
        .set({ ...stripUndefined(input), updatedAt: new Date() })
        .where(eq(reels.id, id))
        .returning({ id: reels.id });
      if (!updated) throw new Error('reel missing immediately after update');
      const row = await findByIdJoined(updated.id);
      if (!row) throw new Error('reel missing immediately after update');
      return row;
    },

    async delete(id) {
      await db.delete(reels).where(eq(reels.id, id));
    },

    async findManyByIds(ids) {
      if (ids.length === 0) return [];
      return db
        .select(SELECT_COLUMNS)
        .from(reels)
        .innerJoin(media, eq(media.id, reels.posterMediaId))
        .where(inArray(reels.id, ids));
    },
  };
}
