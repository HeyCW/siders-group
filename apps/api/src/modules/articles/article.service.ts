import type { ArticleStatus } from '@siders/contracts';
import { AppError } from '../../middleware/errorHandler.js';
import { sanitizeHtml } from '../../lib/sanitizeHtml.js';
import { slugifyRequired } from '../../lib/slugify.js';
import { revalidateArticlePaths, revalidateHomePath, type RevalidateEnv } from '../../lib/revalidate.js';
import type { Logger } from '../../lib/logger.js';
import type {
  ArticleRepository,
  ArticleWithRelations,
  CreateArticleInput,
  UpdateArticleInput,
} from './article.repository.js';
import { isPubliclyVisible } from './article.repository.js';

export interface ArticleCreateInput {
  title: string;
  slug?: string | undefined;
  bodyJson?: unknown;
  excerpt?: string | undefined;
  categoryIds?: string[] | undefined;
  featuredMediaId?: string | null | undefined;
  anakUsahaId?: string | null | undefined;
  seoTitle?: string | undefined;
  seoDescription?: string | undefined;
  isHyperlocalSpotlight?: boolean | undefined;
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
  featuredMediaId?: string | null | undefined;
  anakUsahaId?: string | null | undefined;
  seoTitle?: string | undefined;
  seoDescription?: string | undefined;
  /** Absent on every autosave request — `ArticleAutosaveRequest` declares no field of this name
   *  at all, so this is only ever present when `input` came from a real update
   *  (specs/hyperlocal-spotlight/spec.md - "Autosave never changes the spotlight"). */
  isHyperlocalSpotlight?: boolean | undefined;
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

  /**
   * Deliberately excludes `slug` and `isHyperlocalSpotlight` from its return type, and never
   * reads either field from `input` — both are shared with `autosave` below via the same
   * `ArticleEditInput` type, and this is what keeps autosave from being able to move them,
   * independent of (and in addition to) the narrower `articleAutosaveRequestSchema` that already
   * strips both before either ever reaches this service
   * (specs/article-management/spec.md - "Autosave never alters the slug";
   * specs/hyperlocal-spotlight/spec.md - "Autosave never changes the spotlight"). `update`
   * handles both explicitly, itself, below — never through this helper.
   */
  function toRepositoryFields(input: ArticleEditInput): Pick<
    UpdateArticleInput,
    'title' | 'bodyJson' | 'bodyHtml' | 'excerpt' | 'featuredMediaId' | 'anakUsahaId' | 'seoTitle' | 'seoDescription'
  > {
    const fields: ReturnType<typeof toRepositoryFields> = {};
    if (input.title !== undefined) fields.title = input.title;
    if (input.bodyJson !== undefined) {
      fields.bodyJson = input.bodyJson;
      fields.bodyHtml = sanitizeHtml(input.bodyJson).html;
    }
    if (input.excerpt !== undefined) fields.excerpt = input.excerpt;
    if (input.featuredMediaId !== undefined) fields.featuredMediaId = input.featuredMediaId;
    if (input.anakUsahaId !== undefined) fields.anakUsahaId = input.anakUsahaId;
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
        anakUsahaId: input.anakUsahaId ?? null,
        seoTitle: input.seoTitle ?? null,
        seoDescription: input.seoDescription ?? null,
        categoryIds: input.categoryIds ?? [],
        isHyperlocalSpotlight: input.isHyperlocalSpotlight,
      };
      const article = await repository.create(created);
      // Every write that touches the spotlight affects the homepage, whether or not the flag's
      // value actually changed anything observable — same "revalidate on every write" discipline
      // `curation.service.ts`'s `replace` already applies (specs/hyperlocal-spotlight/spec.md -
      // scenarios under "The public home page renders the resolved spotlight").
      if (input.isHyperlocalSpotlight !== undefined) {
        await revalidateHomePath(revalidateEnv, logger);
      }
      return article;
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
        // Read directly off `input` here, in `update` only — never inside `toRepositoryFields`,
        // which `autosave` below also calls (see that function's doc comment).
        ...(input.isHyperlocalSpotlight !== undefined && { isHyperlocalSpotlight: input.isHyperlocalSpotlight }),
      });

      // Gated on whether the article was *already* publicly visible before this edit — a draft
      // or not-yet-due scheduled article has nothing on the public site yet to invalidate. Uses
      // the same predicate the public read path applies (`isPubliclyVisible`), not a bare
      // `status === 'published'` check: a due-but-unflipped scheduled article is just as public
      // as a `published` one, and skipping it here left its cached pages stale
      // (specs/article-management/spec.md - "Public pages are revalidated when an article
      // changes"; specs/public-news-api/spec.md - "One canonical public visibility rule").
      const wasPubliclyVisible = isPubliclyVisible(existing, new Date());
      if (wasPubliclyVisible) {
        // The old slug too when the slug moved: its cached detail page would otherwise keep
        // serving stale content (or a 404) forever, since nothing revalidates it again. Passed
        // in one call so the shared `/news` and `/` paths are only requested once.
        const movedFrom = updated.slug === existing.slug ? [] : [existing.slug];
        await revalidateArticlePaths(revalidateEnv, logger, updated.slug, ...movedFrom);
      }
      // A spotlight change affects the homepage regardless of whether *this* article's own page
      // needed revalidating — an invisible article can still take or release the spotlight
      // (specs/hyperlocal-spotlight/spec.md - "Draft article can be spotlighted"). Skipped when
      // the call above already fired one for the same request.
      if (input.isHyperlocalSpotlight !== undefined && !wasPubliclyVisible) {
        await revalidateHomePath(revalidateEnv, logger);
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
      });
      if (isPubliclyVisible(existing, new Date())) {
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
      const updated = await repository.updateStatus(id, 'scheduled' satisfies ArticleStatus, publishedAt);
      // Rescheduling a due-but-unflipped scheduled article into the future *removes* it from
      // public view (the new `published_at` is by construction in the future, so
      // `isPubliclyVisible` now reads false) — without this the cached detail/listing/homepage
      // pages kept serving it until ISR's own window happened to expire
      // (specs/article-management/spec.md - "Public pages are revalidated when an article
      // changes").
      if (isPubliclyVisible(existing, new Date())) {
        await revalidateArticlePaths(revalidateEnv, logger, updated.slug);
      }
      return updated;
    },

    async delete(id) {
      const existing = await repository.findById(id);
      if (!existing) throw notFoundError();
      await repository.delete(id);
      if (isPubliclyVisible(existing, new Date())) {
        await revalidateArticlePaths(revalidateEnv, logger, existing.slug);
      }
    },
  };
}
