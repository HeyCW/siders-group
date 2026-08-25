import { sql } from 'drizzle-orm';
import { char, datetime, index, mysqlTable, primaryKey, varchar } from 'drizzle-orm/mysql-core';
import { newId } from '../newId';
import { articles } from './articles';

export const categories = mysqlTable('categories', {
  id: char('id', { length: 36 }).primaryKey().$defaultFn(newId),
  name: varchar('name', { length: 255 }).notNull(),
  slug: varchar('slug', { length: 191 }).notNull().unique(),
  createdAt: datetime('created_at', { fsp: 3 }).notNull().default(sql`CURRENT_TIMESTAMP(3)`),
});

/**
 * Many-to-many: an article carries any number of categories, a category spans any number of
 * articles; there is no `articles.category_id`. Both FKs cascade, so deleting an article or a category detaches the
 * association without leaving an orphaned join row, and never deletes the article itself.
 */
export const articleCategories = mysqlTable(
  'article_categories',
  {
    articleId: char('article_id', { length: 36 })
      .notNull()
      .references(() => articles.id, { onDelete: 'cascade' }),
    categoryId: char('category_id', { length: 36 })
      .notNull()
      .references(() => categories.id, { onDelete: 'cascade' }),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.articleId, table.categoryId] }),
    categoryIdx: index('article_categories_category_idx').on(table.categoryId),
  }),
);
