import { boolean, integer, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { app } from './schema';
import { media } from './media';

/**
 * The partner directory backing the public home page's partner ticker. `logoMediaId` is required
 * and `ON DELETE RESTRICT` rather than `SET NULL` or `CASCADE` — mirroring `reels.posterMediaId`
 * for the same reason: a partner tile without a logo has no graceful degraded state to fall back
 * to, so losing the logo must fail loudly rather than silently leave a partner with nothing to
 * render (specs/partner-management/spec.md - "A partner requires a logo"). `sortOrder` is a plain
 * column rather than a separate ordering table (unlike `home_curation`/`reels_curation`) because a
 * partner has no independent existence outside the ticker — there is no pool to select from
 * (design.md - "Partners are directly-owned entities, not a curated selection").
 */
export const partners = app.table('partners', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  logoMediaId: uuid('logo_media_id')
    .notNull()
    .references(() => media.id, { onDelete: 'restrict' }),
  websiteUrl: text('website_url').notNull(),
  sortOrder: integer('sort_order').notNull(),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
