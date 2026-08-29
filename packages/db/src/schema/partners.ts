import { sql } from 'drizzle-orm';
import { boolean, char, datetime, int, mysqlTable, text, varchar } from 'drizzle-orm/mysql-core';
import { newId } from '../newId.js';
import { media } from './media.js';

/**
 * The partner directory backing the public home page's partner ticker. `logoMediaId` is required
 * and `ON DELETE RESTRICT` rather than `SET NULL` or `CASCADE` — mirroring `guidePicks.photoMediaId`
 * for the same reason: a partner tile without a logo has no graceful degraded state to fall back
 * to, so losing the logo must fail loudly rather than silently leave a partner with nothing to
 * render (specs/partner-management/spec.md - "A partner requires a logo"). `sortOrder` is a plain
 * column rather than a separate ordering table (unlike `home_curation`) because a partner has no
 * independent existence outside the ticker — there is no pool to select from
 * (design.md - "Partners are directly-owned entities, not a curated selection").
 */
export const partners = mysqlTable('partners', {
  id: char('id', { length: 36 }).primaryKey().$defaultFn(newId),
  name: varchar('name', { length: 255 }).notNull(),
  logoMediaId: char('logo_media_id', { length: 36 })
    .notNull()
    .references(() => media.id, { onDelete: 'restrict' }),
  websiteUrl: text('website_url'),
  sortOrder: int('sort_order').notNull(),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: datetime('created_at', { fsp: 3 }).notNull().default(sql`CURRENT_TIMESTAMP(3)`),
  updatedAt: datetime('updated_at', { fsp: 3 }).notNull().default(sql`CURRENT_TIMESTAMP(3)`),
});
