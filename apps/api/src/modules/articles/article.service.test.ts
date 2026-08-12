import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const revalidateArticlePathsMock = vi.fn().mockResolvedValue(undefined);
vi.mock('../../lib/revalidate.js', () => ({
  revalidateArticlePaths: (...args: unknown[]) => revalidateArticlePathsMock(...args),
}));

import { createArticleService } from './article.service.js';
import type { ArticleRepository, ArticleWithRelations, CreateArticleInput, UpdateArticleInput } from './article.repository.js';

function baseRow(overrides: Partial<ArticleWithRelations> = {}): ArticleWithRelations {
  const now = new Date();
  return {
    id: randomUUID(),
    title: 'Untitled',
    slug: 'untitled',
    bodyJson: { type: 'doc', content: [] },
    bodyHtml: '',
    excerpt: null,
    status: 'draft',
    authorId: 'author-1',
    featuredMediaId: null,
    seoTitle: null,
    seoDescription: null,
    publishedAt: null,
    createdAt: now,
    updatedAt: now,
    authorName: 'Jane Author',
    featuredMediaStoragePath: null,
    categories: [],
    tags: [],
    ...overrides,
  };
}

function createFakeArticleRepository() {
  const rows = new Map<string, ArticleWithRelations>();
  const slugs = new Set<string>();

  const repository: ArticleRepository = {
    async create(input: CreateArticleInput) {
      if (slugs.has(input.slug)) throw Object.assign(new Error('duplicate'), { code: '23505' });
      const row = baseRow({
        title: input.title,
        slug: input.slug,
        bodyJson: input.bodyJson,
        bodyHtml: input.bodyHtml,
        excerpt: input.excerpt,
        authorId: input.authorId,
        featuredMediaId: input.featuredMediaId,
        seoTitle: input.seoTitle,
        seoDescription: input.seoDescription,
      });
      rows.set(row.id, row);
      slugs.add(row.slug);
      return row;
    },
    async update(id: string, input: UpdateArticleInput) {
      const existing = rows.get(id);
      if (!existing) throw new Error('not found');
      if (input.slug !== undefined) {
        slugs.delete(existing.slug);
        slugs.add(input.slug);
      }
      const updated: ArticleWithRelations = {
        ...existing,
        ...(input.title !== undefined && { title: input.title }),
        ...(input.slug !== undefined && { slug: input.slug }),
        ...(input.bodyJson !== undefined && { bodyJson: input.bodyJson }),
        ...(input.bodyHtml !== undefined && { bodyHtml: input.bodyHtml }),
        ...(input.excerpt !== undefined && { excerpt: input.excerpt }),
        ...(input.featuredMediaId !== undefined && { featuredMediaId: input.featuredMediaId }),
        updatedAt: new Date(),
      };
      rows.set(id, updated);
      return updated;
    },
    async updateStatus(id: string, status, publishedAt) {
      const existing = rows.get(id);
      if (!existing) throw new Error('not found');
      const updated = { ...existing, status, publishedAt, updatedAt: new Date() };
      rows.set(id, updated);
      return updated;
    },
    async findById(id: string) {
      return rows.get(id) ?? null;
    },
    async listAdmin(status) {
      const all = [...rows.values()];
      return status ? all.filter((r) => r.status === status) : all;
    },
    async delete(id: string) {
      const row = rows.get(id);
      if (row) slugs.delete(row.slug);
      rows.delete(id);
    },
    async slugExists(slug: string, excludeId?: string) {
      const holder = [...rows.values()].find((r) => r.slug === slug);
      return holder !== undefined && holder.id !== excludeId;
    },
    async listPublished() {
      return [];
    },
    async findManyPubliclyVisible() {
      return [];
    },
    async findPublishedBySlug() {
      return null;
    },
    async findDueScheduled() {
      return [];
    },
    async promoteScheduled(id: string, now: Date) {
      const existing = rows.get(id);
      if (!existing) return false;
      if (existing.status !== 'scheduled') return false;
      if (existing.publishedAt === null || existing.publishedAt.getTime() > now.getTime()) return false;
      rows.set(id, { ...existing, status: 'published', updatedAt: new Date() });
      return true;
    },
  };

  return { repository, rows };
}

const revalidateEnv = { APP_ORIGIN: 'https://example.com', REVALIDATE_SECRET: 'x'.repeat(16) };
const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as never;

describe('ArticleService', () => {
  beforeEach(() => {
    revalidateArticlePathsMock.mockClear();
  });

  describe('slug generation', () => {
    it('auto-generates a kebab-case slug from the title when none is given', async () => {
      const { repository } = createFakeArticleRepository();
      const service = createArticleService(repository, revalidateEnv, logger);
      const article = await service.create({ title: 'Local Team Wins Regional Cup' }, 'author-1');
      expect(article.slug).toBe('local-team-wins-regional-cup');
    });

    it('uses a manually supplied slug instead of the generated one', async () => {
      const { repository } = createFakeArticleRepository();
      const service = createArticleService(repository, revalidateEnv, logger);
      const article = await service.create({ title: 'A Title', slug: 'custom-slug' }, 'author-1');
      expect(article.slug).toBe('custom-slug');
    });

    it('rejects a title with no ASCII alphanumerics rather than saving an empty slug', async () => {
      const { repository, rows } = createFakeArticleRepository();
      const service = createArticleService(repository, revalidateEnv, logger);
      await expect(service.create({ title: '!!!' }, 'author-1')).rejects.toMatchObject({ code: 'invalid_slug' });
      expect(rows.size).toBe(0);
    });

    it('rejects a slug that collides with another article', async () => {
      const { repository } = createFakeArticleRepository();
      const service = createArticleService(repository, revalidateEnv, logger);
      await service.create({ title: 'First', slug: 'taken' }, 'author-1');
      await expect(service.create({ title: 'Second', slug: 'taken' }, 'author-1')).rejects.toMatchObject({
        code: 'slug_conflict',
      });
    });

    it('does not move an existing slug when only the title changes', async () => {
      const { repository } = createFakeArticleRepository();
      const service = createArticleService(repository, revalidateEnv, logger);
      const created = await service.create({ title: 'Original Title', slug: 'stable-slug' }, 'author-1');
      const updated = await service.update(created.id, { title: 'A Brand New Title' });
      expect(updated.slug).toBe('stable-slug');
    });

    it('autosave never changes the slug, even if the title changes', async () => {
      const { repository } = createFakeArticleRepository();
      const service = createArticleService(repository, revalidateEnv, logger);
      const created = await service.create({ title: 'Original', slug: 'fixed-slug' }, 'author-1');
      const saved = await service.autosave(created.id, { title: 'Retitled Mid-Sentenc' });
      expect(saved.slug).toBe('fixed-slug');
    });

    it('allows a manual slug override on update', async () => {
      const { repository } = createFakeArticleRepository();
      const service = createArticleService(repository, revalidateEnv, logger);
      const created = await service.create({ title: 'T', slug: 'old-slug' }, 'author-1');
      const updated = await service.update(created.id, { slug: 'new-slug' });
      expect(updated.slug).toBe('new-slug');
    });
  });

  describe('published_at lifecycle', () => {
    it('sets published_at to now when publishing a draft', async () => {
      const { repository } = createFakeArticleRepository();
      const service = createArticleService(repository, revalidateEnv, logger);
      const created = await service.create({ title: 'T' }, 'author-1');
      const before = Date.now();
      const published = await service.publish(created.id);
      expect(published.status).toBe('published');
      expect(published.publishedAt).not.toBeNull();
      expect(published.publishedAt!.getTime()).toBeGreaterThanOrEqual(before);
    });

    it('overwrites a future scheduled published_at when publishing early', async () => {
      const { repository } = createFakeArticleRepository();
      const service = createArticleService(repository, revalidateEnv, logger);
      const created = await service.create({ title: 'T' }, 'author-1');
      const future = new Date(Date.now() + 60 * 60 * 1000);
      await service.schedule(created.id, future);
      const published = await service.publish(created.id);
      expect(published.status).toBe('published');
      expect(published.publishedAt!.getTime()).toBeLessThan(future.getTime());
    });

    it('clears published_at when unpublishing', async () => {
      const { repository } = createFakeArticleRepository();
      const service = createArticleService(repository, revalidateEnv, logger);
      const created = await service.create({ title: 'T' }, 'author-1');
      await service.publish(created.id);
      const unpublished = await service.unpublish(created.id);
      expect(unpublished.status).toBe('draft');
      expect(unpublished.publishedAt).toBeNull();
    });

    it('sets published_at to now, not to any earlier time, when republishing after unpublish', async () => {
      const { repository } = createFakeArticleRepository();
      const service = createArticleService(repository, revalidateEnv, logger);
      const created = await service.create({ title: 'T' }, 'author-1');
      const firstPublish = await service.publish(created.id);
      const firstPublishedAt = firstPublish.publishedAt!.getTime();
      await service.unpublish(created.id);
      await new Promise((resolve) => setTimeout(resolve, 5));
      const republished = await service.publish(created.id);
      expect(republished.publishedAt!.getTime()).toBeGreaterThan(firstPublishedAt);
    });
  });

  describe('status transitions', () => {
    it('rejects publishing an already-published article', async () => {
      const { repository } = createFakeArticleRepository();
      const service = createArticleService(repository, revalidateEnv, logger);
      const created = await service.create({ title: 'T' }, 'author-1');
      await service.publish(created.id);
      await expect(service.publish(created.id)).rejects.toMatchObject({ code: 'invalid_status_transition' });
    });

    it('rejects unpublishing a draft', async () => {
      const { repository } = createFakeArticleRepository();
      const service = createArticleService(repository, revalidateEnv, logger);
      const created = await service.create({ title: 'T' }, 'author-1');
      await expect(service.unpublish(created.id)).rejects.toMatchObject({ code: 'invalid_status_transition' });
    });

    it('rejects scheduling a time that is not in the future', async () => {
      const { repository } = createFakeArticleRepository();
      const service = createArticleService(repository, revalidateEnv, logger);
      const created = await service.create({ title: 'T' }, 'author-1');
      await expect(service.schedule(created.id, new Date(Date.now() - 1000))).rejects.toMatchObject({
        code: 'invalid_schedule_time',
      });
    });
  });

  describe('revalidation', () => {
    it('revalidates on publish', async () => {
      const { repository } = createFakeArticleRepository();
      const service = createArticleService(repository, revalidateEnv, logger);
      const created = await service.create({ title: 'T', slug: 'a-slug' }, 'author-1');
      await service.publish(created.id);
      expect(revalidateArticlePathsMock).toHaveBeenCalledWith(revalidateEnv, logger, 'a-slug');
    });

    it('revalidates on unpublish', async () => {
      const { repository } = createFakeArticleRepository();
      const service = createArticleService(repository, revalidateEnv, logger);
      const created = await service.create({ title: 'T', slug: 'a-slug' }, 'author-1');
      await service.publish(created.id);
      revalidateArticlePathsMock.mockClear();
      await service.unpublish(created.id);
      expect(revalidateArticlePathsMock).toHaveBeenCalledWith(revalidateEnv, logger, 'a-slug');
    });

    it('revalidates on delete of a published article', async () => {
      const { repository } = createFakeArticleRepository();
      const service = createArticleService(repository, revalidateEnv, logger);
      const created = await service.create({ title: 'T', slug: 'a-slug' }, 'author-1');
      await service.publish(created.id);
      revalidateArticlePathsMock.mockClear();
      await service.delete(created.id);
      expect(revalidateArticlePathsMock).toHaveBeenCalledWith(revalidateEnv, logger, 'a-slug');
    });

    it('does not revalidate deleting a draft that was never public', async () => {
      const { repository } = createFakeArticleRepository();
      const service = createArticleService(repository, revalidateEnv, logger);
      const created = await service.create({ title: 'T' }, 'author-1');
      await service.delete(created.id);
      expect(revalidateArticlePathsMock).not.toHaveBeenCalled();
    });

    // "A failed revalidation does not fail the write" (specs/article-management/spec.md) is
    // guaranteed by revalidateArticlePaths itself (lib/revalidate.test.ts - it never throws,
    // even on a network failure or an error response), and this service intentionally relies
    // on that contract rather than duplicating a try/catch around every call site.
  });

  describe('author derivation', () => {
    it('always uses the authorId passed to create, regardless of caller-supplied fields', async () => {
      const { repository } = createFakeArticleRepository();
      const service = createArticleService(repository, revalidateEnv, logger);
      const article = await service.create({ title: 'T' }, 'the-real-author');
      expect(article.authorId).toBe('the-real-author');
    });
  });

  /**
   * A `scheduled` article whose `published_at` has already passed is publicly visible via the
   * read-time fallback (specs/public-news-api/spec.md - "Scheduled article whose time has passed
   * is served immediately"), so every write to it changes public output and must revalidate.
   * Gating on `status === 'published'` missed exactly this state.
   */
  describe('revalidation covers due-but-unflipped scheduled articles', () => {
    /** Bypasses `schedule()`'s future-time guard to construct the due-but-unflipped state. */
    async function createDueScheduled(repository: ArticleRepository, service: ReturnType<typeof createArticleService>) {
      const created = await service.create({ title: 'Due Article', slug: 'due-article' }, 'author-1');
      await repository.updateStatus(created.id, 'scheduled', new Date(Date.now() - 60_000));
      revalidateArticlePathsMock.mockClear();
      return created;
    }

    it('revalidates when a due-but-unflipped scheduled article is deleted', async () => {
      const { repository } = createFakeArticleRepository();
      const service = createArticleService(repository, revalidateEnv, logger);
      const created = await createDueScheduled(repository, service);

      await service.delete(created.id);

      expect(revalidateArticlePathsMock).toHaveBeenCalledWith(revalidateEnv, logger, 'due-article');
    });

    it('revalidates when a due-but-unflipped scheduled article is rescheduled into the future', async () => {
      const { repository } = createFakeArticleRepository();
      const service = createArticleService(repository, revalidateEnv, logger);
      const created = await createDueScheduled(repository, service);

      await service.schedule(created.id, new Date(Date.now() + 86_400_000));

      expect(revalidateArticlePathsMock).toHaveBeenCalledWith(revalidateEnv, logger, 'due-article');
    });

    it('revalidates when a due-but-unflipped scheduled article is edited', async () => {
      const { repository } = createFakeArticleRepository();
      const service = createArticleService(repository, revalidateEnv, logger);
      const created = await createDueScheduled(repository, service);

      await service.update(created.id, { title: 'Edited Title' });

      expect(revalidateArticlePathsMock).toHaveBeenCalledWith(revalidateEnv, logger, 'due-article');
    });

    it('does not revalidate a scheduled article whose time has not yet arrived', async () => {
      const { repository } = createFakeArticleRepository();
      const service = createArticleService(repository, revalidateEnv, logger);
      const created = await service.create({ title: 'Future', slug: 'future' }, 'author-1');
      await service.schedule(created.id, new Date(Date.now() + 86_400_000));
      revalidateArticlePathsMock.mockClear();

      await service.delete(created.id);

      expect(revalidateArticlePathsMock).not.toHaveBeenCalled();
    });

    it('revalidates the old slug as well as the new one when a live article is renamed', async () => {
      const { repository } = createFakeArticleRepository();
      const service = createArticleService(repository, revalidateEnv, logger);
      const created = await service.create({ title: 'T', slug: 'old-slug' }, 'author-1');
      await service.publish(created.id);
      revalidateArticlePathsMock.mockClear();

      await service.update(created.id, { slug: 'new-slug' });

      // Both slugs, and in a single call — `/news` and `/` are shared by both detail paths and
      // must not be requested twice.
      expect(revalidateArticlePathsMock).toHaveBeenCalledTimes(1);
      const revalidatedSlugs = revalidateArticlePathsMock.mock.calls[0]?.slice(2);
      expect(revalidatedSlugs).toEqual(expect.arrayContaining(['new-slug', 'old-slug']));
    });

    it('revalidates only the current slug when an edit leaves the slug alone', async () => {
      const { repository } = createFakeArticleRepository();
      const service = createArticleService(repository, revalidateEnv, logger);
      const created = await service.create({ title: 'T', slug: 'stable' }, 'author-1');
      await service.publish(created.id);
      revalidateArticlePathsMock.mockClear();

      await service.update(created.id, { title: 'New Title' });

      expect(revalidateArticlePathsMock).toHaveBeenCalledWith(revalidateEnv, logger, 'stable');
    });
  });
});
