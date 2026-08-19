import { boolean, integer, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { app } from './schema';
import { media } from './media';

/**
 * The city-guide picks backing the public home page's "Siders Guide of the Week" section.
 * `photoMediaId` is required and `ON DELETE RESTRICT` rather than `SET NULL` or `CASCADE` —
 * mirroring `partners.logoMediaId` for the same reason: a guide pick with no photo has no
 * graceful degraded state to fall back to (specs/guide-of-the-week-management/spec.md - "A guide
 * pick requires a photo"). `sortOrder` is a plain column rather than a separate ordering table —
 * a guide pick has no independent existence outside this section, so there is no pool to select
 * from (design.md - "Guide picks are directly-owned entities, not a curated selection"). No
 * maximum-count constraint anywhere in this table, deliberately — the list is bounded only by how
 * many rows exist (design.md - "No maximum pick count").
 */
export const guidePicks = app.table('guide_picks', {
  id: uuid('id').primaryKey().defaultRandom(),
  city: text('city').notNull(),
  place: text('place').notNull(),
  description: text('description').notNull(),
  photoMediaId: uuid('photo_media_id')
    .notNull()
    .references(() => media.id, { onDelete: 'restrict' }),
  sortOrder: integer('sort_order').notNull(),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
