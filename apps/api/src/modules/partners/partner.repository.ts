import { asc, eq, sql } from 'drizzle-orm';
import { media, partners, type Database } from '@siders/db';
import { AppError } from '../../middleware/errorHandler.js';
import { stripUndefined } from '../../lib/stripUndefined.js';

export interface PartnerRow {
  id: string;
  name: string;
  logoMediaId: string;
  /** Joined from `app.media` at read time so the mapper can derive a logo URL without a second
   *  round trip — mirrors `ReelRow.posterStoragePath` (reel.repository.ts). */
  logoStoragePath: string;
  websiteUrl: string;
  sortOrder: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreatePartnerInput {
  name: string;
  logoMediaId: string;
  websiteUrl: string;
  isActive?: boolean | undefined;
}

export interface UpdatePartnerInput {
  name?: string | undefined;
  logoMediaId?: string | undefined;
  websiteUrl?: string | undefined;
  isActive?: boolean | undefined;
}

export interface PartnerRepository {
  create(input: CreatePartnerInput): Promise<PartnerRow>;
  findById(id: string): Promise<PartnerRow | null>;
  /** Every partner, admin-ordered (includes inactive) — specs/partner-management/spec.md -
   *  "Admin list includes inactive partners". */
  list(): Promise<PartnerRow[]>;
  update(id: string, input: UpdatePartnerInput): Promise<PartnerRow>;
  /** Removing the row is the entire self-heal: there is no separate ordering table whose entry
   *  could be left dangling (design.md - "Partners are directly-owned entities, not a curated
   *  selection"), and the remaining rows' relative order is unaffected by one row's removal
   *  (specs/partner-management/spec.md - "The partner lifecycle self-heals the order"). */
  delete(id: string): Promise<void>;
  /**
   * Whole-list reorder in one transaction (specs/partner-management/spec.md - "Partner order is
   * replaced as a whole list"): locks every partner row first so a concurrent create/delete can't
   * change the id set out from under the validation, then requires `partnerIds` to name exactly
   * that locked set — no more, no fewer — before writing each row's `sortOrder` from its index in
   * the submitted array. Throws `invalid_partner_set` (leaving the transaction to roll back, order
   * untouched) when the submitted set doesn't exactly match.
   */
  reorder(partnerIds: string[]): Promise<PartnerRow[]>;
  /** Active partners only, in stored order — specs/partner-management/spec.md - "Public partner
   *  listing serves only active partners in order". */
  listActiveOrdered(): Promise<PartnerRow[]>;
}

function invalidPartnerSetError(): AppError {
  return new AppError(
    'partnerIds must name exactly the current set of partners, no more and no fewer',
    400,
    'invalid_partner_set',
  );
}

const SELECT_COLUMNS = {
  id: partners.id,
  name: partners.name,
  logoMediaId: partners.logoMediaId,
  logoStoragePath: media.storagePath,
  websiteUrl: partners.websiteUrl,
  sortOrder: partners.sortOrder,
  isActive: partners.isActive,
  createdAt: partners.createdAt,
  updatedAt: partners.updatedAt,
};

export function createPartnerRepository(db: Database): PartnerRepository {
  async function findByIdJoined(id: string): Promise<PartnerRow | null> {
    const [row] = await db
      .select(SELECT_COLUMNS)
      .from(partners)
      .innerJoin(media, eq(media.id, partners.logoMediaId))
      .where(eq(partners.id, id))
      .limit(1);
    return row ?? null;
  }

  async function listAllJoined(): Promise<PartnerRow[]> {
    return db
      .select(SELECT_COLUMNS)
      .from(partners)
      .innerJoin(media, eq(media.id, partners.logoMediaId))
      .orderBy(asc(partners.sortOrder));
  }

  async function listActiveJoined(): Promise<PartnerRow[]> {
    return db
      .select(SELECT_COLUMNS)
      .from(partners)
      .innerJoin(media, eq(media.id, partners.logoMediaId))
      .where(eq(partners.isActive, true))
      .orderBy(asc(partners.sortOrder));
  }

  return {
    async create(input) {
      const [maxRow] = await db
        .select({ nextSortOrder: sql<number>`coalesce(max(${partners.sortOrder}), -1) + 1` })
        .from(partners);
      if (!maxRow) throw new Error('sortOrder aggregate returned no row');
      const [inserted] = await db
        .insert(partners)
        .values({
          name: input.name,
          logoMediaId: input.logoMediaId,
          websiteUrl: input.websiteUrl,
          isActive: input.isActive ?? true,
          sortOrder: maxRow.nextSortOrder,
        })
        .returning({ id: partners.id });
      if (!inserted) throw new Error('partner insert returned no row');
      const row = await findByIdJoined(inserted.id);
      if (!row) throw new Error('partner missing immediately after insert');
      return row;
    },

    findById: findByIdJoined,

    list() {
      return listAllJoined();
    },

    async update(id, input) {
      const [updated] = await db
        .update(partners)
        .set({ ...stripUndefined(input), updatedAt: new Date() })
        .where(eq(partners.id, id))
        .returning({ id: partners.id });
      if (!updated) throw new Error('partner missing immediately after update');
      const row = await findByIdJoined(updated.id);
      if (!row) throw new Error('partner missing immediately after update');
      return row;
    },

    async delete(id) {
      await db.delete(partners).where(eq(partners.id, id));
    },

    async reorder(partnerIds) {
      return db.transaction(async (tx) => {
        const locked = await tx.execute(sql`select id from app.partners for update`);
        const currentIds = new Set(locked.rows.map((r) => (r as { id: string }).id));
        const submittedIds = new Set(partnerIds);
        const sameSize = currentIds.size === submittedIds.size;
        const sameMembers = sameSize && [...currentIds].every((id) => submittedIds.has(id));
        if (!sameSize || !sameMembers) throw invalidPartnerSetError();

        for (const [index, id] of partnerIds.entries()) {
          await tx.update(partners).set({ sortOrder: index, updatedAt: new Date() }).where(eq(partners.id, id));
        }

        return tx
          .select(SELECT_COLUMNS)
          .from(partners)
          .innerJoin(media, eq(media.id, partners.logoMediaId))
          .orderBy(asc(partners.sortOrder));
      });
    },

    listActiveOrdered() {
      return listActiveJoined();
    },
  };
}
