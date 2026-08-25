import { sql } from 'drizzle-orm';
import { char, date, datetime, index, int, mysqlEnum, mysqlTable, primaryKey, text, uniqueIndex, varchar } from 'drizzle-orm/mysql-core';
import { newId } from '../newId';
import { articles } from './articles';
import { readers } from './readers';

export const COMMENT_STATUS_VALUES = ['visible', 'removed'] as const;
export type CommentStatusValue = (typeof COMMENT_STATUS_VALUES)[number];

/**
 * One row per reader per article. The unique index is the toggle's correctness guarantee, not a
 * nicety: the like path is delete-then-insert-if-nothing-was-deleted, so two of a reader's own
 * requests racing each other would otherwise both find no row and both insert
 * (specs/article-engagement/spec.md - "A reader cannot like the same article twice").
 *
 * Both references cascade. A deleted article's likes are meaningless, and a deleted reader's
 * likes are unattributable — neither is worth keeping as an orphan, and the like count is derived
 * from these rows, so a dangling one would inflate it forever.
 */
export const likes = mysqlTable(
  'likes',
  {
    id: char('id', { length: 36 }).primaryKey().$defaultFn(newId),
    readerId: char('reader_id', { length: 36 })
      .notNull()
      .references(() => readers.id, { onDelete: 'cascade' }),
    articleId: char('article_id', { length: 36 })
      .notNull()
      .references(() => articles.id, { onDelete: 'cascade' }),
    createdAt: datetime('created_at', { fsp: 3 }).notNull().default(sql`CURRENT_TIMESTAMP(3)`),
  },
  (table) => ({
    readerArticleUnique: uniqueIndex('likes_reader_article_unique').on(table.readerId, table.articleId),
    // The like *count* query filters on article alone; the unique index above leads with
    // `reader_id` and so cannot serve it.
    articleIdx: index('likes_article_idx').on(table.articleId),
  }),
);

/**
 * Flat by construction: there is no `parent_id` column, so a reply relationship is not
 * representable rather than merely unimplemented
 * (specs/article-engagement/spec.md - "Comments are flat and stored as plain text").
 *
 * `body` is plain text and is never passed through `sanitizeHtml` — that renderer exists for
 * staff-authored Tiptap documents. A comment has no rich-text affordance, so it has no reason to
 * admit markup, and the web client renders it into a text node where markup has no render path to
 * escape through.
 */
export const comments = mysqlTable(
  'comments',
  {
    id: char('id', { length: 36 }).primaryKey().$defaultFn(newId),
    articleId: char('article_id', { length: 36 })
      .notNull()
      .references(() => articles.id, { onDelete: 'cascade' }),
    readerId: char('reader_id', { length: 36 })
      .notNull()
      .references(() => readers.id, { onDelete: 'cascade' }),
    body: text('body').notNull(),
    status: mysqlEnum('status', COMMENT_STATUS_VALUES).notNull().default('visible'),
    createdAt: datetime('created_at', { fsp: 3 }).notNull().default(sql`CURRENT_TIMESTAMP(3)`),
  },
  (table) => ({
    // Covers the public listing's exact shape: filter by article, order newest first.
    articleCreatedAtIdx: index('comments_article_created_at_idx').on(table.articleId, table.createdAt),
  }),
);

/**
 * The daily view aggregate from `docs/ARCHITECTURE.md` §9.1. The composite primary key is what
 * `on duplicate key update` targets, so the counter is a single statement with no read-then-write
 * race.
 *
 * `date` is a calendar date, written by the application as `curdate()` under the connection's UTC
 * setting (`client.ts` pins `timezone: 'Z'`) while `admin-dashboard` reports in Asia/Jakarta, so a
 * view recorded at 05:00 Jakarta lands in the previous day's bucket. This shifts which day a view
 * is attributed to, never whether it is counted, and every dashboard figure derived from this
 * table is a rolling multi-day window (design.md - "View counting").
 */
export const articleViewsDaily = mysqlTable(
  'article_views_daily',
  {
    articleId: char('article_id', { length: 36 })
      .notNull()
      .references(() => articles.id, { onDelete: 'cascade' }),
    date: date('date', { mode: 'string' }).notNull(),
    views: int('views').notNull().default(0),
    uniqueViews: int('unique_views').notNull().default(0),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.articleId, table.date] }),
    // The dashboard scans a trailing window across all articles; the primary key leads with
    // `article_id` and so cannot serve that.
    dateIdx: index('article_views_daily_date_idx').on(table.date),
  }),
);

/**
 * Whether a given visitor has already been counted for a given article on a given day. Inserted
 * with `insert ignore`; the affected row count is the entire uniqueness decision
 * (`docs/ARCHITECTURE.md` §9.1).
 *
 * `visitorHash` is an HMAC of the caller's address keyed on `SESSION_SECRET`, never the address
 * itself — the same reasoning as `sessions.ip_hash`: an IPv4 address is only 2^32 candidates, so
 * an unkeyed digest of one is pseudonymous in name only.
 *
 * **This table grows without bound** — one row per (article, visitor, day), forever. The `date`
 * index exists so a retention job can delete aged rows with a range scan instead of a sequential
 * one. No such job is built here; this note is the record that one is owed.
 */
export const viewSeen = mysqlTable(
  'view_seen',
  {
    articleId: char('article_id', { length: 36 })
      .notNull()
      .references(() => articles.id, { onDelete: 'cascade' }),
    visitorHash: varchar('visitor_hash', { length: 128 }).notNull(),
    date: date('date', { mode: 'string' }).notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.articleId, table.visitorHash, table.date] }),
    dateIdx: index('view_seen_date_idx').on(table.date),
  }),
);
