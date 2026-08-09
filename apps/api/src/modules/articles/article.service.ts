import type { ArticleStatus } from '@siders/contracts';
import { AppError } from '../../middleware/errorHandler.js';
import { sanitizeHtml } from '../../lib/sanitizeHtml.js';
import { slugifyRequired } from '../../lib/slugify.js';
import { revalidateArticlePaths, type RevalidateEnv } from '../../lib/revalidate.js';
import type { Logger } from '../../lib/logger.js';
import type {
  ArticleRepository,
  ArticleWithRelations,
  CreateArticleInput,
  UpdateArticleInput,
} from './article.repository.js';

export interface ArticleCreateInput {
  title: string;
  slug?: string | undefined;
  bodyJson?: unknown;
  excerpt?: string | undefined;
  categoryIds?: string[] | undefined;
  tagIds?: string[] | undefined;
  featuredMediaId?: string | null | undefined;
  seoTitle?: string | undefined;
  seoDescription?: string | undefined;
}

/**
 * Not `Partial<ArticleCreateInput>` — under `exactOptionalPropertyTypes`, `Partial` makes each
 * key optional-when-absent but still rejects an explicit `undefined` value, while
 * `articleUpdateRequestSchema`'s inferred type allows a present key whose value is
 * `T | undefined`. Spelling every field out here keeps the two compatible.
 */
export interface ArticleEditInput {
  title?: string | undefined;
  slug?: string | undefined;
  bodyJson?: unknown;
  excerpt?: string | undefined;
  categoryIds?: string[] | undefined;
  tagIds?: string[] | undefined;
  featuredMediaId?: string | null | undefined;
  seoTitle?: string | undefined;
  seoDescription?: string | undefined;
}

const EMPTY_DOCUMENT = { type: 'doc', content: [] };

function slugConflictError(): AppError {
  return new AppError('That slug is already in use by another article', 409, 'slug_conflict');
}

function notFoundError(): AppError {
  return new AppError('Article not found', 404, 'not_found');
}

function invalidTransitionError(message: string): AppError {
  return new AppError(message, 409, 'invalid_status_transition');
}

export interface ArticleService {
  create(input: ArticleCreateInput, authorId: string): Promise<ArticleWithRelations>;
  update(id: string, input: ArticleEditInput): Promise<ArticleWithRelations>;
  autosave(id: string, input: ArticleEditInput): Promise<ArticleWithRelations>;
  get(id: string): Promise<ArticleWithRelations>;
  list(status?: ArticleStatus): Promise<ArticleWithRelations[]>;
  preview(id: string): Promise<ArticleWithRelations>;
  publish(id: string): Promise<ArticleWithRelations>;
  unpublish(id: string): Promise<ArticleWithRelations>;
  schedule(id: string, publishedAt: Date): Promise<ArticleWithRelations>;
  delete(id: string): Promise<void>;
}

export function createArticleService(
  repository: ArticleRepository,
  revalidateEnv: RevalidateEnv,
  logger: Logger,
): ArticleService {
  /** Only touched when the article has no slug yet, or the caller explicitly overrides it. */
  async function resolveSlug(desired: string | undefined, title: string, excludeId?: string): Promise<string> {
    const candidate = desired && desired.length > 0 ? desired : slugifyRequired(title, 'Title');
    if (await repository.slugExists(candidate, excludeId)) {
      throw slugConflictError();
    }
    return candidate;
  }

  function toRepositoryFields(input: ArticleEditInput): Pick<
    UpdateArticleInput,
    'title' | 'bodyJson' | 'bodyHtml' | 'excerpt' | 'featuredMediaId' | 'seoTitle' | 'seoDescription'
  > {
    const fields: ReturnType<typeof toRepositoryFields> = {};
    if (input.title !== undefined) fields.title = input.title;
    if (input.bodyJson !== undefined) {
      fields.bodyJson = input.bodyJson;
      fields.bodyHtml = sanitizeHtml(input.bodyJson).html;
    }
    if (input.excerpt !== undefined) fields.excerpt = input.excerpt;
    if (input.featuredMediaId !== undefined) fields.featuredMediaId = input.featuredMediaId;
    if (input.seoTitle !== undefined) fields.seoTitle = input.seoTitle;
    if (input.seoDescription !== undefined) fields.seoDescription = input.seoDescription;
    return fields;
  }

  return {
    async create(input, authorId) {
      const slug = await resolveSlug(input.slug, input.title);
      const bodyJson = input.bodyJson ?? EMPTY_DOCUMENT;
      const created: CreateArticleInput = {
        title: input.title,
        slug,
        bodyJson,
        bodyHtml: sanitizeHtml(bodyJson).html,
        excerpt: input.excerpt ?? null,
        authorId,
        featuredMediaId: input.featuredMediaId ?? null,
        seoTitle: input.seoTitle ?? null,
        seoDescription: input.seoDescription ?? null,
        categoryIds: input.categoryIds ?? [],
        tagIds: input.tagIds ?? [],
      };
      return repository.create(created);
    },

    async update(id, input) {
      const existing = await repository.findById(id);
      if (!existing) throw notFoundError();

      // A manual slug override is the only way an existing slug changes — a title edit alone
      // never touches it (specs/article-management/spec.md - "Title change does not move an
      // existing slug"; design.md - "Slug generation, and when it is not regenerated").
      let slug: string | undefined;
      if (input.slug !== undefined && input.slug !== existing.slug) {
        slug = await resolveSlug(input.slug, input.title ?? existing.title, id);
      }

      const updated = await repository.update(id, {
        ...toRepositoryFields(input),
        ...(slug !== undefined && { slug }),
        ...(input.categoryIds !== undefined && { categoryIds: input.categoryIds }),
        ...(input.tagIds !== undefined && { tagIds: input.tagIds }),
      });

      // Only an article that is *currently* published can have public output for this edit to
      // change — a draft or scheduled article has nothing on the public site yet to invalidate
      // (specs/article-management/spec.md - "Public pages are revalidated when an article
      // changes").
      if (existing.status === 'published') {
        await revalidateArticlePaths(revalidateEnv, logger, updated.slug);
      }
      return updated;
    },

    /**
     * Structurally narrower than `update`: `ArticleAutosaveRequest` has no `slug` field, so
     * there is nothing here that could regenerate or move it, and status is never touched
     * (specs/article-management/spec.md - "Autosave never alters the slug").
     */
    async autosave(id, input) {
      const existing = await repository.findById(id);
      if (!existing) throw notFoundError();
      const updated = await repository.update(id, {
        ...toRepositoryFields(input),
        ...(input.categoryIds !== undefined && { categoryIds: input.categoryIds }),
        ...(input.tagIds !== undefined && { tagIds: input.tagIds }),
      });
      if (existing.status === 'published') {
        await revalidateArticlePaths(revalidateEnv, logger, updated.slug);
      }
      return updated;
    },

    async get(id) {
      const row = await repository.findById(id);
      if (!row) throw notFoundError();
      return row;
    },

    list(status) {
      return repository.listAdmin(status);
    },

    async preview(id) {
      const row = await repository.findById(id);
      if (!row) throw notFoundError();
      return row;
    },

    async publish(id) {
      const existing = await repository.findById(id);
      if (!existing) throw notFoundError();
      if (existing.status !== 'draft' && existing.status !== 'scheduled') {
        throw invalidTransitionError('Only a draft or scheduled article can be published');
      }
      // Always overwrites publishedAt with now — including when publishing a scheduled article
      // early, so no published article ever carries a future timestamp from an earlier
      // schedule (design.md - published_at lifecycle table; specs/article-management/spec.md -
      // "Publishing a scheduled article early overwrites its future timestamp").
      const updated = await repository.updateStatus(id, 'published' satisfies ArticleStatus, new Date());
      await revalidateArticlePaths(revalidateEnv, logger, updated.slug);
      return updated;
    },

    async unpublish(id) {
      const existing = await repository.findById(id);
      if (!existing) throw notFoundError();
      if (existing.status !== 'published') {
        throw invalidTransitionError('Only a published article can be unpublished');
      }
      const updated = await repository.updateStatus(id, 'draft' satisfies ArticleStatus, null);
      await revalidateArticlePaths(revalidateEnv, logger, updated.slug);
      return updated;
    },

    async schedule(id, publishedAt) {
      const existing = await repository.findById(id);
      if (!existing) throw notFoundError();
      if (existing.status !== 'draft' && existing.status !== 'scheduled') {
        throw invalidTransitionError('Only a draft or scheduled article can be (re)scheduled');
      }
      if (publishedAt.getTime() <= Date.now()) {
        throw new AppError('Scheduled time must be in the future', 400, 'invalid_schedule_time');
      }
      return repository.updateStatus(id, 'scheduled' satisfies ArticleStatus, publishedAt);
    },

    async delete(id) {
      const existing = await repository.findById(id);
      if (!existing) throw notFoundError();
      await repository.delete(id);
      if (existing.status === 'published') {
        await revalidateArticlePaths(revalidateEnv, logger, existing.slug);
      }
    },
  };
}
