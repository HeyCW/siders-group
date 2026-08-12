import { integer, timestamp, uuid } from 'drizzle-orm/pg-core';
import { app } from './schema';
import { reels } from './reels';

/**
 * One global, ordered list of reels leading the homepage rail. Mirrors `home_curation` exactly:
 * `reelId` is the primary key rather than a surrogate id, so a duplicate entry is structurally
 * impossible instead of merely validated, and `ON DELETE CASCADE` means deleting a reel removes
 * its ordering entry automatically (openspec/changes/add-reels-curation/design.md - "Two
 * tables: the library and the ordering"). `position` is zero-based, assigned from the submitted
 * array index on every write, and is not guaranteed contiguous afterwards.
 */
export const reelsCuration = app.table('reels_curation', {
  reelId: uuid('reel_id')
    .primaryKey()
    .references(() => reels.id, { onDelete: 'cascade' }),
  position: integer('position').notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
