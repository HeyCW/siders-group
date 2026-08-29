import { asc, eq, sql } from 'drizzle-orm';
import { media, newId, partners } from '@siders/db';
import { AppError } from '../../middleware/errorHandler.js';
import { stripUndefined } from '../../lib/stripUndefined.js';
import { isExactIdSet, replaceSortOrder } from '../../lib/replaceSortOrder.js';
import { withTableWriteLock } from '../../lib/tableWriteLock.js';
function invalidPartnerSetError() {
    return new AppError('partnerIds must name exactly the current set of partners, no more and no fewer', 400, 'invalid_partner_set');
}
/**
 * The rule `reorder` enforces: the submitted collection must name every existing partner, nothing
 * more and nothing fewer (specs/partner-management/spec.md - "Missing or unknown identifiers are
 * rejected"). Re-exported under this table-specific name for `partner.repository.test.ts` and any
 * other caller that reads "partner" here; the implementation itself now lives in
 * `lib/replaceSortOrder.ts`, shared with `guidePick.repository.ts`'s identical rule.
 */
export const isExactPartnerIdSet = isExactIdSet;
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
export function createPartnerRepository(db) {
    async function findByIdJoined(id) {
        const [row] = await db
            .select(SELECT_COLUMNS)
            .from(partners)
            .innerJoin(media, eq(media.id, partners.logoMediaId))
            .where(eq(partners.id, id))
            .limit(1);
        return row ?? null;
    }
    async function listAllJoined() {
        return db
            .select(SELECT_COLUMNS)
            .from(partners)
            .innerJoin(media, eq(media.id, partners.logoMediaId))
            .orderBy(asc(partners.sortOrder), asc(partners.createdAt));
    }
    async function listActiveJoined() {
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
            // downstream would notice — `sort_order` carries no unique constraint. The advisory lock is
            // what makes the aggregate hold for the insert; it uses the same name `reorder` locks below,
            // so it excludes a concurrent create and a concurrent reorder alike, but not ordinary reads
            // or an ordinary `update`/`delete` (openspec/changes/migrate-postgres-to-mysql/design.md).
            const id = await db.transaction(async (tx) => {
                return withTableWriteLock(tx, 'partners', async () => {
                    const [maxRow] = await tx
                        .select({ nextSortOrder: sql `coalesce(max(${partners.sortOrder}), -1) + 1` })
                        .from(partners);
                    if (!maxRow)
                        throw new Error('sortOrder aggregate returned no row');
                    const newRowId = newId();
                    await tx.insert(partners).values({
                        id: newRowId,
                        name: input.name,
                        logoMediaId: input.logoMediaId,
                        websiteUrl: input.websiteUrl ?? null,
                        isActive: input.isActive ?? true,
                        sortOrder: maxRow.nextSortOrder,
                    });
                    return newRowId;
                });
            });
            const row = await findByIdJoined(id);
            if (!row)
                throw new Error('partner missing immediately after insert');
            return row;
        },
        findById: findByIdJoined,
        list() {
            return listAllJoined();
        },
        async update(id, input) {
            await db
                .update(partners)
                .set({ ...stripUndefined(input), updatedAt: new Date() })
                .where(eq(partners.id, id));
            const row = await findByIdJoined(id);
            if (!row)
                throw new Error('partner missing immediately after update');
            return row;
        },
        async delete(id) {
            await db.delete(partners).where(eq(partners.id, id));
        },
        reorder(partnerIds) {
            return replaceSortOrder({
                db,
                ids: partnerIds,
                table: 'partners',
                updateSortOrder: (tx, id, sortOrder) => tx.update(partners).set({ sortOrder, updatedAt: new Date() }).where(eq(partners.id, id)),
                selectJoined: (tx) => tx
                    .select(SELECT_COLUMNS)
                    .from(partners)
                    .innerJoin(media, eq(media.id, partners.logoMediaId))
                    .orderBy(asc(partners.sortOrder), asc(partners.createdAt)),
                onInvalidSet: invalidPartnerSetError,
            });
        },
        listActiveOrdered() {
            return listActiveJoined();
        },
    };
}
