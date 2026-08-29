import { and, asc, eq, sql } from 'drizzle-orm';
import { anakUsaha, anakUsahaProfile, media, newId } from '@siders/db';
import { AppError } from '../../middleware/errorHandler.js';
import { isForeignKeyViolation, isUniqueViolationOn, violatedConstraint } from '../../lib/dbErrors.js';
import { isExactIdSet } from '../../lib/replaceSortOrder.js';
import { withTableWriteLock } from '../../lib/tableWriteLock.js';
import { stripUndefined } from '../../lib/stripUndefined.js';
function slugConflictError() {
    return new AppError('That slug is already in use by another anak usaha entry', 409, 'slug_conflict');
}
function profileAlreadyExistsError() {
    return new AppError('This anak usaha entry already has a profile', 409, 'profile_conflict');
}
function unknownAnakUsahaError() {
    return new AppError('anakUsahaId does not reference an existing anak usaha entry', 400, 'invalid_anak_usaha');
}
function invalidLogoMediaError() {
    return new AppError('logoMediaId does not reference an existing media item', 400, 'invalid_logo_media');
}
function invalidProfileSetError() {
    return new AppError('anakUsahaIds must name exactly the current set of anak usaha profiles, no more and no fewer', 400, 'invalid_anak_usaha_profile_set');
}
/**
 * Deleting an anak usaha never touches `articles` directly — `articles.anak_usaha_id` is
 * `ON DELETE SET NULL`, which is what detaches the association without deleting or unpublishing
 * the article (specs/anak-usaha-management/spec.md - "Deleting an anak usaha detaches it without
 * deleting articles").
 */
const JOINED_COLUMNS = {
    id: anakUsaha.id,
    name: anakUsaha.name,
    slug: anakUsaha.slug,
    profileAnakUsahaId: anakUsahaProfile.anakUsahaId,
    logoMediaId: anakUsahaProfile.logoMediaId,
    logoStoragePath: media.storagePath,
    backgroundColor: anakUsahaProfile.backgroundColor,
    description: anakUsahaProfile.description,
    kind: anakUsahaProfile.kind,
    links: anakUsahaProfile.links,
    sortOrder: anakUsahaProfile.sortOrder,
    isActive: anakUsahaProfile.isActive,
};
function toWithProfileRow(row) {
    return {
        id: row.id,
        name: row.name,
        slug: row.slug,
        profile: row.profileAnakUsahaId === null
            ? null
            : {
                logoMediaId: row.logoMediaId,
                logoStoragePath: row.logoStoragePath,
                backgroundColor: row.backgroundColor,
                description: row.description,
                kind: row.kind ?? '',
                links: (row.links ?? []),
                sortOrder: row.sortOrder ?? 0,
                isActive: row.isActive ?? false,
            },
    };
}
async function listWithProfileJoined(executor) {
    const rows = await executor
        .select(JOINED_COLUMNS)
        .from(anakUsaha)
        .leftJoin(anakUsahaProfile, eq(anakUsahaProfile.anakUsahaId, anakUsaha.id))
        .leftJoin(media, eq(media.id, anakUsahaProfile.logoMediaId))
        .orderBy(asc(anakUsahaProfile.sortOrder), asc(anakUsaha.createdAt));
    return rows.map(toWithProfileRow);
}
async function findWithProfileJoined(executor, anakUsahaId) {
    const [row] = await executor
        .select(JOINED_COLUMNS)
        .from(anakUsaha)
        .leftJoin(anakUsahaProfile, eq(anakUsahaProfile.anakUsahaId, anakUsaha.id))
        .leftJoin(media, eq(media.id, anakUsahaProfile.logoMediaId))
        .where(eq(anakUsaha.id, anakUsahaId))
        .limit(1);
    return row ? toWithProfileRow(row) : null;
}
async function findProfileJoined(executor, anakUsahaId) {
    const [row] = await executor
        .select({
        logoMediaId: anakUsahaProfile.logoMediaId,
        logoStoragePath: media.storagePath,
        backgroundColor: anakUsahaProfile.backgroundColor,
        description: anakUsahaProfile.description,
        kind: anakUsahaProfile.kind,
        links: anakUsahaProfile.links,
        sortOrder: anakUsahaProfile.sortOrder,
        isActive: anakUsahaProfile.isActive,
    })
        .from(anakUsahaProfile)
        .leftJoin(media, eq(media.id, anakUsahaProfile.logoMediaId))
        .where(eq(anakUsahaProfile.anakUsahaId, anakUsahaId))
        .limit(1);
    if (!row)
        return null;
    return {
        logoMediaId: row.logoMediaId,
        logoStoragePath: row.logoStoragePath,
        backgroundColor: row.backgroundColor,
        description: row.description,
        kind: row.kind,
        links: (row.links ?? []),
        sortOrder: row.sortOrder,
        isActive: row.isActive,
    };
}
export function createAnakUsahaRepository(db) {
    return {
        async create(input) {
            try {
                const id = newId();
                await db.insert(anakUsaha).values({ ...input, id });
                const [row] = await db.select().from(anakUsaha).where(eq(anakUsaha.id, id)).limit(1);
                if (!row)
                    throw new Error('anak usaha missing immediately after insert');
                return row;
            }
            catch (err) {
                if (isUniqueViolationOn(err, 'anak_usaha_slug_unique'))
                    throw slugConflictError();
                throw err;
            }
        },
        async update(id, input) {
            try {
                await db.update(anakUsaha).set(input).where(eq(anakUsaha.id, id));
                const [row] = await db.select().from(anakUsaha).where(eq(anakUsaha.id, id)).limit(1);
                if (!row)
                    throw new Error('anak usaha missing immediately after update');
                return row;
            }
            catch (err) {
                if (isUniqueViolationOn(err, 'anak_usaha_slug_unique'))
                    throw slugConflictError();
                throw err;
            }
        },
        async findById(id) {
            const [row] = await db.select().from(anakUsaha).where(eq(anakUsaha.id, id)).limit(1);
            return row ?? null;
        },
        async slugExists(slug, excludeId) {
            const condition = excludeId
                ? and(eq(anakUsaha.slug, slug), sql `${anakUsaha.id} != ${excludeId}`)
                : eq(anakUsaha.slug, slug);
            const [row] = await db.select({ id: anakUsaha.id }).from(anakUsaha).where(condition).limit(1);
            return row !== undefined;
        },
        async delete(id) {
            await db.delete(anakUsaha).where(eq(anakUsaha.id, id));
        },
        async list() {
            return db.select().from(anakUsaha);
        },
        listWithProfile() {
            return listWithProfileJoined(db);
        },
        findWithProfile(anakUsahaId) {
            return findWithProfileJoined(db, anakUsahaId);
        },
        findProfile(anakUsahaId) {
            return findProfileJoined(db, anakUsahaId);
        },
        async createProfile(input) {
            try {
                // Same read-then-write-under-lock shape as `partner.repository.ts`'s `create`: two
                // concurrent creates outside a transaction could read the same `max(sortOrder)` and
                // collide, since `sortOrder` carries no unique constraint. Uses the same advisory-lock
                // name as `reorderProfiles` below so the two mutually exclude each other, exactly like
                // the SHARE ROW EXCLUSIVE / EXCLUSIVE lock pair this replaces
                // (openspec/changes/migrate-postgres-to-mysql/design.md).
                await db.transaction(async (tx) => {
                    await withTableWriteLock(tx, 'anak_usaha_profile', async () => {
                        const [maxRow] = await tx
                            .select({ nextSortOrder: sql `coalesce(max(${anakUsahaProfile.sortOrder}), -1) + 1` })
                            .from(anakUsahaProfile);
                        if (!maxRow)
                            throw new Error('sortOrder aggregate returned no row');
                        await tx.insert(anakUsahaProfile).values({
                            anakUsahaId: input.anakUsahaId,
                            logoMediaId: input.logoMediaId ?? null,
                            backgroundColor: input.backgroundColor ?? null,
                            description: input.description ?? null,
                            kind: input.kind,
                            links: input.links ?? [],
                            sortOrder: maxRow.nextSortOrder,
                        });
                    });
                });
            }
            catch (err) {
                // `PRIMARY`, not a `_pkey`-suffixed name: `anakUsahaId` is both the primary key and the
                // FK here, and MySQL always names the primary key's own index `PRIMARY` regardless of
                // the table (openspec/changes/migrate-postgres-to-mysql/design.md - constraint-name
                // translation).
                if (isUniqueViolationOn(err, 'PRIMARY'))
                    throw profileAlreadyExistsError();
                if (isForeignKeyViolation(err)) {
                    const constraint = violatedConstraint(err) ?? '';
                    if (constraint.includes('logo_media_id'))
                        throw invalidLogoMediaError();
                    if (constraint.includes('anak_usaha_id'))
                        throw unknownAnakUsahaError();
                }
                throw err;
            }
            const profile = await findProfileJoined(db, input.anakUsahaId);
            if (!profile)
                throw new Error('anak usaha profile missing immediately after insert');
            return profile;
        },
        async updateProfile(anakUsahaId, input) {
            try {
                await db
                    .update(anakUsahaProfile)
                    .set({ ...stripUndefined(input), updatedAt: new Date() })
                    .where(eq(anakUsahaProfile.anakUsahaId, anakUsahaId));
            }
            catch (err) {
                if (isForeignKeyViolation(err) && violatedConstraint(err)?.includes('logo_media_id')) {
                    throw invalidLogoMediaError();
                }
                throw err;
            }
            const profile = await findProfileJoined(db, anakUsahaId);
            if (!profile)
                throw new Error('anak usaha profile missing immediately after update');
            return profile;
        },
        async deleteProfile(anakUsahaId) {
            await db.delete(anakUsahaProfile).where(eq(anakUsahaProfile.anakUsahaId, anakUsahaId));
        },
        reorderProfiles(anakUsahaIds) {
            return db.transaction(async (tx) => {
                return withTableWriteLock(tx, 'anak_usaha_profile', async () => {
                    const [rows] = (await tx.execute(sql `select anak_usaha_id as id from anak_usaha_profile`));
                    const currentIds = rows.map((r) => r.id);
                    if (!isExactIdSet(currentIds, anakUsahaIds))
                        throw invalidProfileSetError();
                    for (const [index, id] of anakUsahaIds.entries()) {
                        await tx
                            .update(anakUsahaProfile)
                            .set({ sortOrder: index, updatedAt: new Date() })
                            .where(eq(anakUsahaProfile.anakUsahaId, id));
                    }
                    return listWithProfileJoined(tx);
                });
            });
        },
    };
}
