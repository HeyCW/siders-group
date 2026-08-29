import { asc, eq, inArray, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/mysql-core';
import { isVideoMimeType } from '@siders/contracts';
import { media, guidePicks, newId } from '@siders/db';
import { AppError } from '../../middleware/errorHandler.js';
import { stripUndefined } from '../../lib/stripUndefined.js';
import { isExactIdSet, replaceSortOrder } from '../../lib/replaceSortOrder.js';
import { withTableWriteLock } from '../../lib/tableWriteLock.js';
function invalidGuidePickSetError() {
    return new AppError('guidePickIds must name exactly the current set of guide picks, no more and no fewer', 400, 'invalid_guide_pick_set');
}
function photoMustBeImageError() {
    return new AppError('photoMediaId must reference an image, not a video', 400, 'photo_must_be_image');
}
function videoMustBeVideoError() {
    return new AppError('videoMediaId must reference a video, not an image', 400, 'video_must_be_video');
}
/**
 * The rule `reorder` enforces: the submitted collection must name every existing guide pick,
 * nothing more and nothing fewer
 * (specs/guide-of-the-week-management/spec.md - "Reorder submits every existing id"). Re-exported
 * under this table-specific name for `guidePick.repository.test.ts`; the implementation itself
 * lives in `lib/replaceSortOrder.ts`, shared with `partner.repository.ts`'s identical rule.
 */
export const isExactGuidePickIdSet = isExactIdSet;
/** Second reference to `app.media` for the video join — `photoMediaId` and `videoMediaId` both
 *  point at the same table, so one of the two joins must be aliased. */
const videoMedia = alias(media, 'video_media');
const SELECT_COLUMNS = {
    id: guidePicks.id,
    city: guidePicks.city,
    place: guidePicks.place,
    description: guidePicks.description,
    photoMediaId: guidePicks.photoMediaId,
    photoStoragePath: media.storagePath,
    videoMediaId: guidePicks.videoMediaId,
    videoStoragePath: videoMedia.storagePath,
    sortOrder: guidePicks.sortOrder,
    isActive: guidePicks.isActive,
    createdAt: guidePicks.createdAt,
    updatedAt: guidePicks.updatedAt,
};
/**
 * Rejects a photo/video pair whose kinds are swapped or otherwise wrong, ahead of the insert or
 * update (specs/guide-of-the-week-management/spec.md - "Photo must be an image, not a video" /
 * "Video must be a video, not an image"). A media id that doesn't exist at all is left alone here
 * — that case is reported by the foreign-key violation the subsequent write raises, translated by
 * the service into `invalid_photo_media`/`invalid_video_media`, so existence and kind stay two
 * separate failures.
 */
async function assertMediaKinds(db, input) {
    const ids = [input.photoMediaId, input.videoMediaId].filter((id) => id !== undefined);
    if (ids.length === 0)
        return;
    const rows = await db.select({ id: media.id, mime: media.mime }).from(media).where(inArray(media.id, ids));
    const mimeById = new Map(rows.map((row) => [row.id, row.mime]));
    if (input.photoMediaId !== undefined) {
        const mime = mimeById.get(input.photoMediaId);
        if (mime !== undefined && isVideoMimeType(mime))
            throw photoMustBeImageError();
    }
    if (input.videoMediaId !== undefined) {
        const mime = mimeById.get(input.videoMediaId);
        if (mime !== undefined && !isVideoMimeType(mime))
            throw videoMustBeVideoError();
    }
}
export function createGuidePickRepository(db) {
    async function findByIdJoined(id) {
        const [row] = await db
            .select(SELECT_COLUMNS)
            .from(guidePicks)
            .innerJoin(media, eq(media.id, guidePicks.photoMediaId))
            .innerJoin(videoMedia, eq(videoMedia.id, guidePicks.videoMediaId))
            .where(eq(guidePicks.id, id))
            .limit(1);
        return row ?? null;
    }
    async function listAllJoined() {
        return db
            .select(SELECT_COLUMNS)
            .from(guidePicks)
            .innerJoin(media, eq(media.id, guidePicks.photoMediaId))
            .innerJoin(videoMedia, eq(videoMedia.id, guidePicks.videoMediaId))
            .orderBy(asc(guidePicks.sortOrder), asc(guidePicks.createdAt));
    }
    async function listActiveJoined() {
        return db
            .select(SELECT_COLUMNS)
            .from(guidePicks)
            .innerJoin(media, eq(media.id, guidePicks.photoMediaId))
            .innerJoin(videoMedia, eq(videoMedia.id, guidePicks.videoMediaId))
            .where(eq(guidePicks.isActive, true))
            .orderBy(asc(guidePicks.sortOrder), asc(guidePicks.createdAt));
    }
    return {
        async create(input) {
            await assertMediaKinds(db, input);
            // Read-then-write on `max(sort_order)`, so it has to be one transaction — see
            // `partner.repository.ts`'s `create` for why the advisory lock (the same name `reorder`
            // below acquires) is what makes the aggregate hold for the insert.
            const id = await db.transaction(async (tx) => {
                return withTableWriteLock(tx, 'guide_picks', async () => {
                    const [maxRow] = await tx
                        .select({ nextSortOrder: sql `coalesce(max(${guidePicks.sortOrder}), -1) + 1` })
                        .from(guidePicks);
                    if (!maxRow)
                        throw new Error('sortOrder aggregate returned no row');
                    const newRowId = newId();
                    await tx.insert(guidePicks).values({
                        id: newRowId,
                        city: input.city,
                        place: input.place,
                        description: input.description,
                        photoMediaId: input.photoMediaId,
                        videoMediaId: input.videoMediaId,
                        isActive: input.isActive ?? true,
                        sortOrder: maxRow.nextSortOrder,
                    });
                    return newRowId;
                });
            });
            const row = await findByIdJoined(id);
            if (!row)
                throw new Error('guide pick missing immediately after insert');
            return row;
        },
        findById: findByIdJoined,
        list() {
            return listAllJoined();
        },
        async update(id, input) {
            await assertMediaKinds(db, input);
            await db
                .update(guidePicks)
                .set({ ...stripUndefined(input), updatedAt: new Date() })
                .where(eq(guidePicks.id, id));
            const row = await findByIdJoined(id);
            if (!row)
                throw new Error('guide pick missing immediately after update');
            return row;
        },
        async delete(id) {
            await db.delete(guidePicks).where(eq(guidePicks.id, id));
        },
        reorder(guidePickIds) {
            return replaceSortOrder({
                db,
                ids: guidePickIds,
                table: 'guide_picks',
                updateSortOrder: (tx, id, sortOrder) => tx.update(guidePicks).set({ sortOrder, updatedAt: new Date() }).where(eq(guidePicks.id, id)),
                selectJoined: (tx) => tx
                    .select(SELECT_COLUMNS)
                    .from(guidePicks)
                    .innerJoin(media, eq(media.id, guidePicks.photoMediaId))
                    .innerJoin(videoMedia, eq(videoMedia.id, guidePicks.videoMediaId))
                    .orderBy(asc(guidePicks.sortOrder), asc(guidePicks.createdAt)),
                onInvalidSet: invalidGuidePickSetError,
            });
        },
        listActiveOrdered() {
            return listActiveJoined();
        },
    };
}
