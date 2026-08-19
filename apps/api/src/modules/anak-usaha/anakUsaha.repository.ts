import { and, eq, sql } from 'drizzle-orm';
import { anakUsaha, type Database } from '@siders/db';
import { AppError } from '../../middleware/errorHandler.js';
import { isUniqueViolationOn } from '../../lib/pgErrors.js';

export interface AnakUsahaRow {
  id: string;
  name: string;
  slug: string;
}

function slugConflictError(): AppError {
  return new AppError('That slug is already in use by another anak usaha entry', 409, 'slug_conflict');
}

export interface AnakUsahaRepository {
  create(input: { name: string; slug: string }): Promise<AnakUsahaRow>;
  update(id: string, input: { name: string; slug: string }): Promise<AnakUsahaRow>;
  findById(id: string): Promise<AnakUsahaRow | null>;
  slugExists(slug: string, excludeId?: string): Promise<boolean>;
  delete(id: string): Promise<void>;
  list(): Promise<AnakUsahaRow[]>;
}

/**
 * Deleting an anak usaha never touches `articles` directly — `articles.anak_usaha_id` is
 * `ON DELETE SET NULL`, which is what detaches the association without deleting or unpublishing
 * the article (specs/anak-usaha-management/spec.md - "Deleting an anak usaha detaches it without
 * deleting articles").
 */
export function createAnakUsahaRepository(db: Database): AnakUsahaRepository {
  return {
    async create(input) {
      try {
        const [row] = await db.insert(anakUsaha).values(input).returning();
        if (!row) throw new Error('anak usaha insert returned no row');
        return row;
      } catch (err) {
        if (isUniqueViolationOn(err, 'anak_usaha_slug_unique')) throw slugConflictError();
        throw err;
      }
    },

    async update(id, input) {
      try {
        const [row] = await db.update(anakUsaha).set(input).where(eq(anakUsaha.id, id)).returning();
        if (!row) throw new Error('anak usaha missing immediately after update');
        return row;
      } catch (err) {
        if (isUniqueViolationOn(err, 'anak_usaha_slug_unique')) throw slugConflictError();
        throw err;
      }
    },

    async findById(id) {
      const [row] = await db.select().from(anakUsaha).where(eq(anakUsaha.id, id)).limit(1);
      return row ?? null;
    },

    async slugExists(slug, excludeId) {
      const condition = excludeId
        ? and(eq(anakUsaha.slug, slug), sql`${anakUsaha.id} != ${excludeId}`)
        : eq(anakUsaha.slug, slug);
      const [row] = await db.select({ id: anakUsaha.id }).from(anakUsaha).where(condition).limit(1);
      return row !== undefined;
    },

    async delete(id) {
      await db.delete(anakUsaha).where(eq(anakUsaha.id, id));
    },

    async list() {
      return db.select().from(anakUsaha);
    },
  };
}
