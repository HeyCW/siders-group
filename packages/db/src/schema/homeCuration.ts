import { integer, timestamp, uuid } from 'drizzle-orm/pg-core';
import { app } from './schema';
import { articles } from './articles';

/**
 * One global, ordered list of articles leading the public homepage. `articleId` is the primary
 * key rather than a surrogate id, so a duplicate pick is structurally impossible instead of
 * merely validated (design.md - "Data model"). `ON DELETE CASCADE` matters specifically because
 * articles are hard-deleted in this system — without it, deleting an article would leave a
 * curated row pointing at nothing. `position` is contiguous and zero-based, assigned from the
 * submitted array index on every write; nothing reads its absolute value.
 */
export const homeCuration = app.table('home_curation', {
  articleId: uuid('article_id')
    .primaryKey()
    .references(() => articles.id, { onDelete: 'cascade' }),
  position: integer('position').notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
