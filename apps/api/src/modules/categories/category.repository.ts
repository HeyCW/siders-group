import { and, eq, sql } from 'drizzle-orm';
import { categories, type Database } from '@siders/db';
import { AppError } from '../../middleware/errorHandler.js';
import { isUniqueViolationOn } from '../../lib/pgErrors.js';

export interface CategoryRow {
  id: string;
  name: string;
  slug: string;
}

function slugConflictError(): AppError {
  return new AppError('That slug is already in use by another category', 409, 'slug_conflict');
}

export interface CategoryRepository {
  create(input: { name: string; slug: string }): Promise<CategoryRow>;
  update(id: string, input: { name: string; slug: string }): Promise<CategoryRow>;
  findById(id: string): Promise<CategoryRow | null>;
  slugExists(slug: string, excludeId?: string): Promise<boolean>;
  delete(id: string): Promise<void>;
  list(): Promise<CategoryRow[]>;
}

/**
 * Deleting a category never touches `articles` — the `article_categories` join row cascades
 * on its own FK (`ON DELETE CASCADE`), which is what detaches the association without deleting
 * or unpublishing the article itself (specs/category-management/spec.md - "Deleting a category
 * detaches it without deleting articles").
 */
export function createCategoryRepository(db: Database): CategoryRepository {
  return {
    async create(input) {
      try {
        const [row] = await db.insert(categories).values(input).returning();
        if (!row) throw new Error('category insert returned no row');
        return row;
      } catch (err) {
        if (isUniqueViolationOn(err, 'categories_slug_unique')) throw slugConflictError();
        throw err;
      }
    },

    async update(id, input) {
      try {
        const [row] = await db.update(categories).set(input).where(eq(categories.id, id)).returning();
        if (!row) throw new Error('category missing immediately after update');
        return row;
      } catch (err) {
        if (isUniqueViolationOn(err, 'categories_slug_unique')) throw slugConflictError();
        throw err;
      }
    },

    async findById(id) {
      const [row] = await db.select().from(categories).where(eq(categories.id, id)).limit(1);
      return row ?? null;
    },

    async slugExists(slug, excludeId) {
      const condition = excludeId
        ? and(eq(categories.slug, slug), sql`${categories.id} != ${excludeId}`)
        : eq(categories.slug, slug);
      const [row] = await db.select({ id: categories.id }).from(categories).where(condition).limit(1);
      return row !== undefined;
    },

    async delete(id) {
      await db.delete(categories).where(eq(categories.id, id));
    },

    async list() {
      return db.select().from(categories);
    },
  };
}
