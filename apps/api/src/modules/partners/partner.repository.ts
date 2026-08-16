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
   * replaced as a whole list"): takes an EXCLUSIVE table lock, reads the current id set, requires
   * `partnerIds` to name exactly that set — no more, no fewer — then writes each row's `sortOrder`
   * from its index in the submitted array. Throws `invalid_partner_set` (leaving the transaction to
   * roll back, order untouched) when the submitted set doesn't match.
   *
   * **The lock is on the table, not the rows.** `SELECT ... FOR UPDATE` would look sufficient and
   * is not: Postgres row locks take no predicate or gap locks, so they block a concurrent DELETE
   * but never an INSERT — a partner created between the read and the validation would leave the
   * checked set already stale. `LOCK TABLE ... IN EXCLUSIVE MODE` conflicts with the ROW EXCLUSIVE
   * that INSERT/UPDATE/DELETE take, so it is what actually makes "exactly the current set" true for
   * the length of the transaction, while still admitting plain reads (ACCESS SHARE). This is the
   * same reason `lib/replaceOrdering.ts` takes a table lock for the curation tables; only one table
   * is touched here, so there is no lock-ordering cycle to design around.
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

/**
 * The rule `reorder` enforces: the submitted collection must name every existing partner, nothing
 * more and nothing fewer (specs/partner-management/spec.md - "Missing or unknown identifiers are
 * rejected"). Pure and exported so the rule is testable without a database — the same shape as
 * `article.repository.ts`'s exported `isPubliclyVisible`, since this repo has no live-DB harness.
 *
 * Compared as sets, not just by length: `partnerReorderRequestSchema` already rejects duplicate
 * ids, so a duplicate reaching here would be a contract regression, and set comparison fails it
 * rather than letting `[a, a]` pass against a stored `{a, b}`.
 */
export function isExactPartnerIdSet(currentIds: readonly string[], submittedIds: readonly string[]): boolean {
  if (currentIds.length !== submittedIds.length) return false;
  const current = new Set(currentIds);
  const submitted = new Set(submittedIds);
  if (current.size !== submitted.size) return false;
  for (const id of current) {
    if (!submitted.has(id)) return false;
  }
  return true;
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
      .orderBy(asc(partners.sortOrder), asc(partners.createdAt));
  }

  async function listActiveJoined(): Promise<PartnerRow[]> {
    return db
      .select(SELECT_COLUMNS)
      .from(partners)
      .innerJoin(media, eq(media.id, partners.logoMediaId))
      .where(eq(partners.isActive, true))
      .orderBy(asc(partners.sortOrder), asc(partners.createdAt));
  }

  return {
    async create(input) {
      // Read-then-write on `max(sort_order)`, so it has to be one transaction: two concurrent
      // creates outside one both read the same max and land on the same `sortOrder`, and nothing
      // downstream would notice — `sort_order` carries no unique constraint. The SHARE lock is what
      // makes the aggregate hold for the insert; it blocks a concurrent create's aggregate (and a
      // reorder's EXCLUSIVE) but not ordinary reads.
      const inserted = await db.transaction(async (tx) => {
        await tx.execute(sql`LOCK TABLE app.partners IN SHARE ROW EXCLUSIVE MODE`);
        const [maxRow] = await tx
          .select({ nextSortOrder: sql<number>`coalesce(max(${partners.sortOrder}), -1) + 1` })
          .from(partners);
        if (!maxRow) throw new Error('sortOrder aggregate returned no row');
        const [row] = await tx
          .insert(partners)
          .values({
            name: input.name,
            logoMediaId: input.logoMediaId,
            websiteUrl: input.websiteUrl,
            isActive: input.isActive ?? true,
            sortOrder: maxRow.nextSortOrder,
          })
          .returning({ id: partners.id });
        if (!row) throw new Error('partner insert returned no row');
        return row;
      });
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
        await tx.execute(sql`LOCK TABLE app.partners IN EXCLUSIVE MODE`);
        const current = await tx.execute(sql`select id from app.partners`);
        const currentIds = current.rows.map((r) => (r as { id: string }).id);
        if (!isExactPartnerIdSet(currentIds, partnerIds)) throw invalidPartnerSetError();

        for (const [index, id] of partnerIds.entries()) {
          await tx.update(partners).set({ sortOrder: index, updatedAt: new Date() }).where(eq(partners.id, id));
        }

        return tx
          .select(SELECT_COLUMNS)
          .from(partners)
          .innerJoin(media, eq(media.id, partners.logoMediaId))
          .orderBy(asc(partners.sortOrder), asc(partners.createdAt));
      });
    },

    listActiveOrdered() {
      return listActiveJoined();
    },
  };
}
