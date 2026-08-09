import { and, desc, eq, inArray, isNotNull, lte, notInArray, or, sql } from 'drizzle-orm';
import {
  articles,
  articleCategories,
  articleTags,
  categories,
  tags,
  media,
  users,
  type Database,
} from '@siders/db';
import type { ArticleStatus } from '@siders/contracts';
import { AppError } from '../../middleware/errorHandler.js';
import { stripUndefined } from '../../lib/stripUndefined.js';

export interface ArticleRow {
  id: string;
  title: string;
  slug: string;
  bodyJson: unknown;
  bodyHtml: string;
  excerpt: string | null;
  status: ArticleStatus;
  authorId: string;
  featuredMediaId: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface TaxonomyRef {
  id: string;
  name: string;
  slug: string;
}

export interface ArticleWithRelations extends ArticleRow {
  authorName: string;
  featuredMediaStoragePath: string | null;
  categories: TaxonomyRef[];
  tags: TaxonomyRef[];
}

export interface CreateArticleInput {
  title: string;
  slug: string;
  bodyJson: unknown;
  bodyHtml: string;
  excerpt: string | null;
  authorId: string;
  featuredMediaId: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  categoryIds: string[];
  tagIds: string[];
}

export interface UpdateArticleInput {
  title?: string | undefined;
  slug?: string | undefined;
  bodyJson?: unknown;
  bodyHtml?: string | undefined;
  excerpt?: string | null | undefined;
  featuredMediaId?: string | null | undefined;
  seoTitle?: string | null | undefined;
  seoDescription?: string | null | undefined;
  categoryIds?: string[] | undefined;
  tagIds?: string[] | undefined;
}

export interface PublicListFilter {
  limit: number;
  offset: number;
  categorySlug?: string | undefined;
  tagSlug?: string | undefined;
  excludeIds?: string[] | undefined;
  now: Date;
}

/** Drizzle queries only — no Express types here. */
export interface ArticleRepository {
  create(input: CreateArticleInput): Promise<ArticleWithRelations>;
  update(id: string, input: UpdateArticleInput): Promise<ArticleWithRelations>;
  updateStatus(id: string, status: ArticleStatus, publishedAt: Date | null): Promise<ArticleWithRelations>;
  findById(id: string): Promise<ArticleWithRelations | null>;
  /** Admin listing — every status, newest first. Backs the admin article list view. */
  listAdmin(status?: ArticleStatus): Promise<ArticleWithRelations[]>;
  delete(id: string): Promise<void>;
  slugExists(slug: string, excludeId?: string): Promise<boolean>;
  listPublished(filter: PublicListFilter): Promise<ArticleWithRelations[]>;
  findPublishedBySlug(slug: string, now: Date): Promise<ArticleWithRelations | null>;
  /** `scheduled` articles whose `published_at` has passed — the scheduled-publish worker's input. */
  findDueScheduled(now: Date): Promise<{ id: string; slug: string; publishedAt: Date }[]>;
}

function isForeignKeyViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && (err as { code: unknown }).code === '23503';
}

function invalidTaxonomyError(): AppError {
  return new AppError('One or more category or tag ids do not exist', 400, 'invalid_taxonomy_reference');
}

/**
 * The single canonical public visibility predicate (specs/public-news-api/spec.md - "One
 * canonical public visibility rule"). `listPublished` and `findPublishedBySlug` both call this
 * — there is deliberately no second definition anywhere else in this codebase, so the list and
 * by-slug endpoints can never disagree about whether a scheduled-but-due article is visible.
 */
function publiclyVisible(now: Date) {
  return or(
    // `published` requires a timestamp too: without this, a row whose publishedAt is somehow
    // null would reach the mapper, which cannot build a public DTO for it and throws — turning
    // one bad row into a 500 for the whole listing instead of simply omitting it.
    and(eq(articles.status, 'published'), isNotNull(articles.publishedAt)),
    and(eq(articles.status, 'scheduled'), lte(articles.publishedAt, now)),
  );
}

type Executor = Database | Parameters<Parameters<Database['transaction']>[0]>[0];

async function replaceTaxonomy(
  tx: Executor,
  articleId: string,
  input: { categoryIds?: string[] | undefined; tagIds?: string[] | undefined },
): Promise<void> {
  if (input.categoryIds !== undefined) {
    await tx.delete(articleCategories).where(eq(articleCategories.articleId, articleId));
    if (input.categoryIds.length > 0) {
      await tx
        .insert(articleCategories)
        .values(input.categoryIds.map((categoryId) => ({ articleId, categoryId })));
    }
  }
  if (input.tagIds !== undefined) {
    await tx.delete(articleTags).where(eq(articleTags.articleId, articleId));
    if (input.tagIds.length > 0) {
      await tx.insert(articleTags).values(input.tagIds.map((tagId) => ({ articleId, tagId })));
    }
  }
}

function groupByArticleId<T extends { articleId: string }>(rows: T[]): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const list = map.get(row.articleId);
    if (list) list.push(row);
    else map.set(row.articleId, [row]);
  }
  return map;
}

async function attachRelations(db: Database, rows: ArticleRow[]): Promise<ArticleWithRelations[]> {
  if (rows.length === 0) return [];
  const articleIds = rows.map((r) => r.id);
  const authorIds = [...new Set(rows.map((r) => r.authorId))];
  const mediaIds = [...new Set(rows.map((r) => r.featuredMediaId).filter((id): id is string => id !== null))];

  const [categoryLinks, tagLinks, authors, mediaRows] = await Promise.all([
    db
      .select({ articleId: articleCategories.articleId, id: categories.id, name: categories.name, slug: categories.slug })
      .from(articleCategories)
      .innerJoin(categories, eq(categories.id, articleCategories.categoryId))
      .where(inArray(articleCategories.articleId, articleIds)),
    db
      .select({ articleId: articleTags.articleId, id: tags.id, name: tags.name, slug: tags.slug })
      .from(articleTags)
      .innerJoin(tags, eq(tags.id, articleTags.tagId))
      .where(inArray(articleTags.articleId, articleIds)),
    authorIds.length > 0
      ? db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, authorIds))
      : Promise.resolve([]),
    mediaIds.length > 0
      ? db.select({ id: media.id, storagePath: media.storagePath }).from(media).where(inArray(media.id, mediaIds))
      : Promise.resolve([]),
  ]);

  const categoriesByArticle = groupByArticleId(categoryLinks);
  const tagsByArticle = groupByArticleId(tagLinks);
  const authorNameById = new Map(authors.map((a) => [a.id, a.name]));
  const mediaPathById = new Map(mediaRows.map((m) => [m.id, m.storagePath]));

  return rows.map((row) => ({
    ...row,
    authorName: authorNameById.get(row.authorId) ?? 'Unknown',
    featuredMediaStoragePath: row.featuredMediaId ? (mediaPathById.get(row.featuredMediaId) ?? null) : null,
    categories: (categoriesByArticle.get(row.id) ?? []).map(({ id, name, slug }) => ({ id, name, slug })),
    tags: (tagsByArticle.get(row.id) ?? []).map(({ id, name, slug }) => ({ id, name, slug })),
  }));
}

export function createArticleRepository(db: Database): ArticleRepository {
  async function findRowById(id: string): Promise<ArticleRow | null> {
    const [row] = await db.select().from(articles).where(eq(articles.id, id)).limit(1);
    return row ?? null;
  }

  return {
    async create(input) {
      try {
        const row = await db.transaction(async (tx) => {
          const [inserted] = await tx
            .insert(articles)
            .values({
              title: input.title,
              slug: input.slug,
              bodyJson: input.bodyJson,
              bodyHtml: input.bodyHtml,
              excerpt: input.excerpt,
              authorId: input.authorId,
              featuredMediaId: input.featuredMediaId,
              seoTitle: input.seoTitle,
              seoDescription: input.seoDescription,
            })
            .returning();
          if (!inserted) throw new Error('article insert returned no row');
          await replaceTaxonomy(tx, inserted.id, { categoryIds: input.categoryIds, tagIds: input.tagIds });
          return inserted;
        });
        const [withRelations] = await attachRelations(db, [row]);
        if (!withRelations) throw new Error('article missing immediately after create');
        return withRelations;
      } catch (err) {
        if (isForeignKeyViolation(err)) throw invalidTaxonomyError();
        throw err;
      }
    },

    async update(id, input) {
      try {
        await db.transaction(async (tx) => {
          const { categoryIds, tagIds, ...fields } = input;
          const definedFields = stripUndefined(fields);
          if (Object.keys(definedFields).length > 0) {
            await tx.update(articles).set({ ...definedFields, updatedAt: new Date() }).where(eq(articles.id, id));
          }
          await replaceTaxonomy(tx, id, { categoryIds, tagIds });
        });
      } catch (err) {
        if (isForeignKeyViolation(err)) throw invalidTaxonomyError();
        throw err;
      }
      const row = await findRowById(id);
      if (!row) throw new Error('article missing immediately after update');
      const [withRelations] = await attachRelations(db, [row]);
      if (!withRelations) throw new Error('article missing immediately after update');
      return withRelations;
    },

    async updateStatus(id, status, publishedAt) {
      await db.update(articles).set({ status, publishedAt, updatedAt: new Date() }).where(eq(articles.id, id));
      const row = await findRowById(id);
      if (!row) throw new Error('article missing immediately after status update');
      const [withRelations] = await attachRelations(db, [row]);
      if (!withRelations) throw new Error('article missing immediately after status update');
      return withRelations;
    },

    async findById(id) {
      const row = await findRowById(id);
      if (!row) return null;
      const [withRelations] = await attachRelations(db, [row]);
      return withRelations ?? null;
    },

    async listAdmin(status) {
      const rows = await db
        .select()
        .from(articles)
        .where(status ? eq(articles.status, status) : undefined)
        .orderBy(desc(articles.updatedAt));
      return attachRelations(db, rows);
    },

    async delete(id) {
      await db.delete(articles).where(eq(articles.id, id));
    },

    async slugExists(slug, excludeId) {
      const condition = excludeId
        ? and(eq(articles.slug, slug), sql`${articles.id} != ${excludeId}`)
        : eq(articles.slug, slug);
      const [row] = await db.select({ id: articles.id }).from(articles).where(condition).limit(1);
      return row !== undefined;
    },

    async listPublished(filter) {
      const conditions = [publiclyVisible(filter.now)];

      if (filter.categorySlug) {
        conditions.push(
          inArray(
            articles.id,
            db
              .select({ id: articleCategories.articleId })
              .from(articleCategories)
              .innerJoin(categories, eq(categories.id, articleCategories.categoryId))
              .where(eq(categories.slug, filter.categorySlug)),
          ),
        );
      }
      if (filter.tagSlug) {
        conditions.push(
          inArray(
            articles.id,
            db
              .select({ id: articleTags.articleId })
              .from(articleTags)
              .innerJoin(tags, eq(tags.id, articleTags.tagId))
              .where(eq(tags.slug, filter.tagSlug)),
          ),
        );
      }
      if (filter.excludeIds && filter.excludeIds.length > 0) {
        conditions.push(notInArray(articles.id, filter.excludeIds));
      }

      const rows = await db
        .select()
        .from(articles)
        .where(and(...conditions))
        // `id` breaks ties deterministically when two articles share a publishedAt instant, so
        // paging never repeats or skips an article across requests
        // (specs/public-news-api/spec.md - "Stable ordering across pages").
        .orderBy(desc(articles.publishedAt), desc(articles.id))
        .limit(filter.limit)
        .offset(filter.offset);

      return attachRelations(db, rows);
    },

    async findPublishedBySlug(slug, now) {
      const [row] = await db
        .select()
        .from(articles)
        .where(and(eq(articles.slug, slug), publiclyVisible(now)))
        .limit(1);
      if (!row) return null;
      const [withRelations] = await attachRelations(db, [row]);
      return withRelations ?? null;
    },

    async findDueScheduled(now) {
      const rows = await db
        .select({ id: articles.id, slug: articles.slug, publishedAt: articles.publishedAt })
        .from(articles)
        .where(and(eq(articles.status, 'scheduled'), lte(articles.publishedAt, now)));
      // `publishedAt` is never null on a `scheduled` row (design.md's lifecycle table sets it
      // whenever status becomes `scheduled`), so the filter is a type narrowing, not a real
      // exclusion.
      return rows.filter((r): r is { id: string; slug: string; publishedAt: Date } => r.publishedAt !== null);
    },
  };
}
