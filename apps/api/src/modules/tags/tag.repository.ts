import { and, eq, sql } from 'drizzle-orm';
import { tags, type Database } from '@siders/db';

export interface TagRow {
  id: string;
  name: string;
  slug: string;
}

export interface TagRepository {
  create(input: { name: string; slug: string }): Promise<TagRow>;
  update(id: string, input: { name: string; slug: string }): Promise<TagRow>;
  findById(id: string): Promise<TagRow | null>;
  slugExists(slug: string, excludeId?: string): Promise<boolean>;
  delete(id: string): Promise<void>;
  list(): Promise<TagRow[]>;
}

/**
 * Deleting a tag never touches `articles` — the `article_tags` join row cascades on its own FK
 * (`ON DELETE CASCADE`), detaching the association without deleting or unpublishing the article
 * (specs/tag-management/spec.md - "Deleting a tag detaches it without deleting articles").
 */
export function createTagRepository(db: Database): TagRepository {
  return {
    async create(input) {
      const [row] = await db.insert(tags).values(input).returning();
      if (!row) throw new Error('tag insert returned no row');
      return row;
    },

    async update(id, input) {
      const [row] = await db.update(tags).set(input).where(eq(tags.id, id)).returning();
      if (!row) throw new Error('tag missing immediately after update');
      return row;
    },

    async findById(id) {
      const [row] = await db.select().from(tags).where(eq(tags.id, id)).limit(1);
      return row ?? null;
    },

    async slugExists(slug, excludeId) {
      const condition = excludeId ? and(eq(tags.slug, slug), sql`${tags.id} != ${excludeId}`) : eq(tags.slug, slug);
      const [row] = await db.select({ id: tags.id }).from(tags).where(condition).limit(1);
      return row !== undefined;
    },

    async delete(id) {
      await db.delete(tags).where(eq(tags.id, id));
    },

    async list() {
      return db.select().from(tags);
    },
  };
}
