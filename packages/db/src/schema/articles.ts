import { index, jsonb, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { app } from './schema';
import { users } from './users';
import { media } from './media';
import { anakUsaha } from './anakUsaha';

export const articleStatus = app.enum('article_status', ['draft', 'scheduled', 'published']);

/**
 * `bodyJson` (Tiptap/ProseMirror document) is the source of truth; `bodyHtml` is derived from
 * it by `sanitizeHtml` on every save and is what the public site renders
 * (design.md - "Content storage"). `featuredMediaId` references the canonical `media` record
 * rather than storing a display URL, and clears rather than cascades when that record is
 * deleted (design.md - "Featured image references app.media"). `publishedAt` is set on publish
 * and cleared on unpublish — see design.md's `published_at` lifecycle table — so a published
 * article never carries a stale future timestamp from an earlier schedule.
 */
export const articles = app.table(
  'articles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    title: text('title').notNull(),
    slug: text('slug').notNull().unique(),
    bodyJson: jsonb('body_json').notNull(),
    bodyHtml: text('body_html').notNull(),
    excerpt: text('excerpt'),
    status: articleStatus('status').notNull().default('draft'),
    authorId: uuid('author_id')
      .notNull()
      .references(() => users.id),
    featuredMediaId: uuid('featured_media_id').references(() => media.id, { onDelete: 'set null' }),
    anakUsahaId: uuid('anak_usaha_id').references(() => anakUsaha.id, { onDelete: 'set null' }),
    seoTitle: text('seo_title'),
    seoDescription: text('seo_description'),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    // The public list/by-slug queries filter on status and order by publishedAt — the pair
    // this index covers is exactly the read-time visibility predicate
    // (specs/public-news-api/spec.md - "One canonical public visibility rule").
    statusPublishedAtIdx: index('articles_status_published_at_idx').on(table.status, table.publishedAt),
    authorIdx: index('articles_author_idx').on(table.authorId),
    featuredMediaIdx: index('articles_featured_media_idx').on(table.featuredMediaId),
    anakUsahaIdx: index('articles_anak_usaha_idx').on(table.anakUsahaId),
  }),
);
