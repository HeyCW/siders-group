import { asc, eq, sql } from 'drizzle-orm';
import { media, guidePicks, type Database } from '@siders/db';
import { AppError } from '../../middleware/errorHandler.js';
import { stripUndefined } from '../../lib/stripUndefined.js';
import { isExactIdSet, replaceSortOrder } from '../../lib/replaceSortOrder.js';

export interface GuidePickRow {
  id: string;
  city: string;
  place: string;
  description: string;
  photoMediaId: string;
  /** Joined from `app.media` at read time so the mapper can derive a photo URL without a second
   *  round trip — mirrors `PartnerRow.logoStoragePath` (partner.repository.ts). */
  photoStoragePath: string;
  sortOrder: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateGuidePickInput {
  city: string;
  place: string;
  description: string;
  photoMediaId: string;
  isActive?: boolean | undefined;
}

export interface UpdateGuidePickInput {
  city?: string | undefined;
  place?: string | undefined;
  description?: string | undefined;
  photoMediaId?: string | undefined;
  isActive?: boolean | undefined;
}

export interface GuidePickRepository {
  create(input: CreateGuidePickInput): Promise<GuidePickRow>;
  findById(id: string): Promise<GuidePickRow | null>;
  /** Every guide pick, admin-ordered (includes inactive) —
   *  specs/guide-of-the-week-management/spec.md - "Admin list includes inactive guide picks". */
  list(): Promise<GuidePickRow[]>;
  update(id: string, input: UpdateGuidePickInput): Promise<GuidePickRow>;
  /** Removing the row is the entire self-heal: there is no separate ordering table whose entry
   *  could be left dangling (design.md - "Guide picks are directly-owned entities, not a curated
   *  selection"), and the remaining rows' relative order is unaffected by one row's removal
   *  (specs/guide-of-the-week-management/spec.md - "Deleting a guide pick heals the stored
   *  order"). */
  delete(id: string): Promise<void>;
  /**
   * Whole-list reorder in one transaction
   * (specs/guide-of-the-week-management/spec.md - "Guide-pick order is replaced as a whole
   * list"): takes an EXCLUSIVE table lock, reads the current id set, requires `guidePickIds` to
   * name exactly that set — no more, no fewer — then writes each row's `sortOrder` from its index
   * in the submitted array. Throws `invalid_guide_pick_set` (leaving the transaction to roll
   * back, order untouched) when the submitted set doesn't match. Mirrors
   * `partner.repository.ts`'s `reorder` — see its comment for why the lock is table-level rather
   * than row-level.
   */
  reorder(guidePickIds: string[]): Promise<GuidePickRow[]>;
  /** Active guide picks only, in stored order —
   *  specs/guide-of-the-week-management/spec.md - "Public read serves only active guide picks in
   *  order". */
  listActiveOrdered(): Promise<GuidePickRow[]>;
}

function invalidGuidePickSetError(): AppError {
  return new AppError(
    'guidePickIds must name exactly the current set of guide picks, no more and no fewer',
    400,
    'invalid_guide_pick_set',
  );
}

/**
 * The rule `reorder` enforces: the submitted collection must name every existing guide pick,
 * nothing more and nothing fewer
 * (specs/guide-of-the-week-management/spec.md - "Reorder submits every existing id"). Re-exported
 * under this table-specific name for `guidePick.repository.test.ts`; the implementation itself
 * lives in `lib/replaceSortOrder.ts`, shared with `partner.repository.ts`'s identical rule.
 */
export const isExactGuidePickIdSet = isExactIdSet;

const SELECT_COLUMNS = {
  id: guidePicks.id,
  city: guidePicks.city,
  place: guidePicks.place,
  description: guidePicks.description,
  photoMediaId: guidePicks.photoMediaId,
  photoStoragePath: media.storagePath,
  sortOrder: guidePicks.sortOrder,
  isActive: guidePicks.isActive,
  createdAt: guidePicks.createdAt,
  updatedAt: guidePicks.updatedAt,
};

export function createGuidePickRepository(db: Database): GuidePickRepository {
  async function findByIdJoined(id: string): Promise<GuidePickRow | null> {
    const [row] = await db
      .select(SELECT_COLUMNS)
      .from(guidePicks)
      .innerJoin(media, eq(media.id, guidePicks.photoMediaId))
      .where(eq(guidePicks.id, id))
      .limit(1);
    return row ?? null;
  }

  async function listAllJoined(): Promise<GuidePickRow[]> {
    return db
      .select(SELECT_COLUMNS)
      .from(guidePicks)
      .innerJoin(media, eq(media.id, guidePicks.photoMediaId))
      .orderBy(asc(guidePicks.sortOrder), asc(guidePicks.createdAt));
  }

  async function listActiveJoined(): Promise<GuidePickRow[]> {
    return db
      .select(SELECT_COLUMNS)
      .from(guidePicks)
      .innerJoin(media, eq(media.id, guidePicks.photoMediaId))
      .where(eq(guidePicks.isActive, true))
      .orderBy(asc(guidePicks.sortOrder), asc(guidePicks.createdAt));
  }

  return {
    async create(input) {
      // Read-then-write on `max(sort_order)`, so it has to be one transaction — see
      // `partner.repository.ts`'s `create` for why the SHARE lock is what makes the aggregate
      // hold for the insert.
      const inserted = await db.transaction(async (tx) => {
        await tx.execute(sql`LOCK TABLE app.guide_picks IN SHARE ROW EXCLUSIVE MODE`);
        const [maxRow] = await tx
          .select({ nextSortOrder: sql<number>`coalesce(max(${guidePicks.sortOrder}), -1) + 1` })
          .from(guidePicks);
        if (!maxRow) throw new Error('sortOrder aggregate returned no row');
        const [row] = await tx
          .insert(guidePicks)
          .values({
            city: input.city,
            place: input.place,
            description: input.description,
            photoMediaId: input.photoMediaId,
            isActive: input.isActive ?? true,
            sortOrder: maxRow.nextSortOrder,
          })
          .returning({ id: guidePicks.id });
        if (!row) throw new Error('guide pick insert returned no row');
        return row;
      });
      const row = await findByIdJoined(inserted.id);
      if (!row) throw new Error('guide pick missing immediately after insert');
      return row;
    },

    findById: findByIdJoined,

    list() {
      return listAllJoined();
    },

    async update(id, input) {
      const [updated] = await db
        .update(guidePicks)
        .set({ ...stripUndefined(input), updatedAt: new Date() })
        .where(eq(guidePicks.id, id))
        .returning({ id: guidePicks.id });
      if (!updated) throw new Error('guide pick missing immediately after update');
      const row = await findByIdJoined(updated.id);
      if (!row) throw new Error('guide pick missing immediately after update');
      return row;
    },

    async delete(id) {
      await db.delete(guidePicks).where(eq(guidePicks.id, id));
    },

    reorder(guidePickIds) {
      return replaceSortOrder({
        db,
        ids: guidePickIds,
        table: 'app.guide_picks',
        updateSortOrder: (tx, id, sortOrder) =>
          tx.update(guidePicks).set({ sortOrder, updatedAt: new Date() }).where(eq(guidePicks.id, id)),
        selectJoined: (tx) =>
          tx
            .select(SELECT_COLUMNS)
            .from(guidePicks)
            .innerJoin(media, eq(media.id, guidePicks.photoMediaId))
            .orderBy(asc(guidePicks.sortOrder), asc(guidePicks.createdAt)),
        onInvalidSet: invalidGuidePickSetError,
      });
    },

    listActiveOrdered() {
      return listActiveJoined();
    },
  };
}
