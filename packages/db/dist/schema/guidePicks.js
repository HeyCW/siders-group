import { sql } from 'drizzle-orm';
import { boolean, char, datetime, int, mysqlTable, text, varchar } from 'drizzle-orm/mysql-core';
import { newId } from '../newId.js';
import { media } from './media.js';
/**
 * The city-guide picks backing the public home page's "Siders Guideline of the Week" section.
 * `photoMediaId` is optional and `ON DELETE RESTRICT` rather than `SET NULL` or `CASCADE` when
 * present — the public page no longer renders a photo before video playback, so a pick with no
 * photo is a normal, complete state (specs/guide-of-the-week-management/spec.md - "A guide pick's
 * photo is optional"). `videoMediaId` is required and `ON DELETE RESTRICT` since a guide pick has
 * no presentable state without its video. `sortOrder` is a plain column rather than a separate
 * ordering table — a guide pick has no independent existence outside this section, so there is no
 * pool to select from (design.md - "Guide picks are directly-owned entities, not a curated
 * selection"). No maximum-count constraint anywhere in this table, deliberately — the list is
 * bounded only by how many rows exist (design.md - "No maximum pick count").
 */
export const guidePicks = mysqlTable('guide_picks', {
    id: char('id', { length: 36 }).primaryKey().$defaultFn(newId),
    city: varchar('city', { length: 255 }).notNull(),
    place: varchar('place', { length: 255 }).notNull(),
    description: text('description').notNull(),
    photoMediaId: char('photo_media_id', { length: 36 }).references(() => media.id, { onDelete: 'restrict' }),
    videoMediaId: char('video_media_id', { length: 36 })
        .notNull()
        .references(() => media.id, { onDelete: 'restrict' }),
    sortOrder: int('sort_order').notNull(),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: datetime('created_at', { fsp: 3 }).notNull().default(sql `CURRENT_TIMESTAMP(3)`),
    updatedAt: datetime('updated_at', { fsp: 3 }).notNull().default(sql `CURRENT_TIMESTAMP(3)`),
});
