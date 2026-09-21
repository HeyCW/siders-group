import { sql } from 'drizzle-orm';
import { char, datetime, mysqlEnum, mysqlTable } from 'drizzle-orm/mysql-core';
import { articles } from './articles.js';

/**
 * The hyperlocal spotlight: one permanent row holding at most one editor-picked article
 * (openspec/changes/add-hyperlocal-spotlight). `slot` is an enum of exactly one legal value
 * rather than a plain string primary key, so a second row is rejected by the column's own type,
 * not merely by application discipline — the same "structurally impossible, not merely
 * validated" reasoning `home_curation` applies to `article_id` as its primary key
 * (design.md - "The checkbox is UI over a singleton slot, not a boolean column on `articles`").
 *
 * `articleId` is nullable and deliberately never inserted or deleted — the migration seeds the
 * one row once, and every write thereafter is a plain `UPDATE` of it. `NULL` is not an
 * exceptional state: it is the "no editor pick" state, and the spotlight resolves to the most
 * recently published article whenever it reads `NULL` (design.md - "Exactly one row, forever;
 * `article_id NULL` means 'newest article'").
 *
 * The foreign key is `ON DELETE SET NULL`, not `CASCADE` as `home_curation` uses for its own
 * article reference. `home_curation`'s rows *are* the picks, so cascading a delete removes the
 * right thing. Here the row *is the slot itself* and must outlive any article it points at —
 * cascading would delete the slot, reintroducing the "does a row exist?" question this design
 * exists to remove (design.md - "Article deletion nulls the pick — `SET NULL`, not `CASCADE`").
 */
export const hyperlocalSpotlight = mysqlTable('hyperlocal_spotlight', {
  slot: mysqlEnum('slot', ['default']).primaryKey().default('default'),
  articleId: char('article_id', { length: 36 }).references(() => articles.id, { onDelete: 'set null' }),
  updatedAt: datetime('updated_at', { fsp: 3 }).notNull().default(sql`CURRENT_TIMESTAMP(3)`),
});
