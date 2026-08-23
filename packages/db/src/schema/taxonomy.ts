import { index, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { app } from './schema';
import { articles } from './articles';

export const categories = app.table('categories', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Many-to-many: an article carries any number of categories, a category spans any number of
 * articles; there is no `articles.category_id`. Both FKs cascade, so deleting an article or a category detaches the
 * association without leaving an orphaned join row, and never deletes the article itself.
 */
export const articleCategories = app.table(
  'article_categories',
  {
    articleId: uuid('article_id')
      .notNull()
      .references(() => articles.id, { onDelete: 'cascade' }),
    categoryId: uuid('category_id')
      .notNull()
      .references(() => categories.id, { onDelete: 'cascade' }),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.articleId, table.categoryId] }),
    categoryIdx: index('article_categories_category_idx').on(table.categoryId),
  }),
);
