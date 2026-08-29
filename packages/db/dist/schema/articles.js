import { sql } from 'drizzle-orm';
import { char, datetime, index, json, mysqlEnum, mysqlTable, text, varchar } from 'drizzle-orm/mysql-core';
import { newId } from '../newId.js';
import { users } from './users.js';
import { media } from './media.js';
import { anakUsaha } from './anakUsaha.js';
export const ARTICLE_STATUS_VALUES = ['draft', 'scheduled', 'published'];
/**
 * `bodyJson` (Tiptap/ProseMirror document) is the source of truth; `bodyHtml` is derived from
 * it by `sanitizeHtml` on every save and is what the public site renders
 * (design.md - "Content storage"). `featuredMediaId` references the canonical `media` record
 * rather than storing a display URL, and clears rather than cascades when that record is
 * deleted (design.md - "Featured image references app.media"). `publishedAt` is set on publish
 * and cleared on unpublish — see design.md's `published_at` lifecycle table — so a published
 * article never carries a stale future timestamp from an earlier schedule.
 */
export const articles = mysqlTable('articles', {
    id: char('id', { length: 36 }).primaryKey().$defaultFn(newId),
    // `varchar(500)`, not `text`, to match every sibling short single-line name/label column
    // converted in this migration — bound matches `packages/contracts/src/article.ts`'s
    // `z.string().min(1).max(500)` at the API boundary.
    title: varchar('title', { length: 500 }).notNull(),
    slug: varchar('slug', { length: 255 }).notNull().unique(),
    bodyJson: json('body_json').notNull(),
    bodyHtml: text('body_html').notNull(),
    excerpt: text('excerpt'),
    status: mysqlEnum('status', ARTICLE_STATUS_VALUES).notNull().default('draft'),
    authorId: char('author_id', { length: 36 })
        .notNull()
        .references(() => users.id),
    featuredMediaId: char('featured_media_id', { length: 36 }).references(() => media.id, { onDelete: 'set null' }),
    anakUsahaId: char('anak_usaha_id', { length: 36 }).references(() => anakUsaha.id, { onDelete: 'set null' }),
    seoTitle: text('seo_title'),
    seoDescription: text('seo_description'),
    publishedAt: datetime('published_at', { fsp: 3 }),
    createdAt: datetime('created_at', { fsp: 3 }).notNull().default(sql `CURRENT_TIMESTAMP(3)`),
    updatedAt: datetime('updated_at', { fsp: 3 }).notNull().default(sql `CURRENT_TIMESTAMP(3)`),
}, (table) => ({
    // The public list/by-slug queries filter on status and order by publishedAt — the pair
    // this index covers is exactly the read-time visibility predicate
    // (specs/public-news-api/spec.md - "One canonical public visibility rule").
    statusPublishedAtIdx: index('articles_status_published_at_idx').on(table.status, table.publishedAt),
    authorIdx: index('articles_author_idx').on(table.authorId),
    featuredMediaIdx: index('articles_featured_media_idx').on(table.featuredMediaId),
    anakUsahaIdx: index('articles_anak_usaha_idx').on(table.anakUsahaId),
}));
