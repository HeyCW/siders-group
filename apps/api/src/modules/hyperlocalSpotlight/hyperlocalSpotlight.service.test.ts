import { describe, expect, it } from 'vitest';
import {
  isPubliclyVisible,
  type ArticleRepository,
  type ArticleWithRelations,
  type PublicListFilter,
} from '../articles/article.repository.js';
import { createHyperlocalSpotlightService } from './hyperlocalSpotlight.service.js';
import type { HyperlocalSpotlightRepository } from './hyperlocalSpotlight.repository.js';

const env = { MEDIA_PUBLIC_BASE_URL: 'https://media.example.com' };

function article(overrides: Partial<ArticleWithRelations> & Pick<ArticleWithRelations, 'id'>): ArticleWithRelations {
  return {
    title: `Title ${overrides.id}`,
    slug: `slug-${overrides.id}`,
    bodyJson: { type: 'doc', content: [] },
    bodyHtml: '',
    excerpt: null,
    status: 'published',
    authorId: 'author-1',
    featuredMediaId: null,
    anakUsahaId: null,
    seoTitle: null,
    seoDescription: null,
    publishedAt: new Date('2026-01-01T00:00:00Z'),
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    authorName: 'Jane Author',
    featuredMediaStoragePath: null,
    categories: [],
    anakUsaha: null,
    ...overrides,
  };
}

/** A fake covering only what the spotlight service calls; every other method is unused here —
 *  same convention `homeFeed.service.test.ts` uses for its own fake. */
function createFakeArticleRepository(articles: ArticleWithRelations[]) {
  const listPublishedCalls: PublicListFilter[] = [];
  const byId = new Map(articles.map((a) => [a.id, a]));
  const repository: ArticleRepository = {
    create: () => {
      throw new Error('not used by hyperlocalSpotlight.service tests');
    },
    update: () => {
      throw new Error('not used by hyperlocalSpotlight.service tests');
    },
    updateStatus: () => {
      throw new Error('not used by hyperlocalSpotlight.service tests');
    },
    listAdmin: () => {
      throw new Error('not used by hyperlocalSpotlight.service tests');
    },
    delete: () => {
      throw new Error('not used by hyperlocalSpotlight.service tests');
    },
    slugExists: () => {
      throw new Error('not used by hyperlocalSpotlight.service tests');
    },
    findDueScheduled: () => {
      throw new Error('not used by hyperlocalSpotlight.service tests');
    },
    findPublishedBySlug: () => {
      throw new Error('not used by hyperlocalSpotlight.service tests');
    },
    promoteScheduled: () => {
      throw new Error('not used by hyperlocalSpotlight.service tests');
    },
    async findById(id) {
      return byId.get(id) ?? null;
    },
    async findManyPubliclyVisible(ids, now) {
      return ids
        .map((id) => byId.get(id))
        .filter((a): a is ArticleWithRelations => a !== undefined && isPubliclyVisible(a, now));
    },
    async listPublished(filter) {
      listPublishedCalls.push(filter);
      return articles
        .filter((a) => isPubliclyVisible(a, filter.now))
        .sort((a, b) => (b.publishedAt?.getTime() ?? 0) - (a.publishedAt?.getTime() ?? 0))
        .slice(filter.offset, filter.offset + filter.limit);
    },
  };
  return { repository, listPublishedCalls };
}

function createFakeSpotlightRepository(articleId: string | null): HyperlocalSpotlightRepository {
  return {
    async getArticleId() {
      return articleId;
    },
    set: () => {
      throw new Error('not used by hyperlocalSpotlight.service tests — writes go through article.repository.ts');
    },
    clearIfHeldBy: () => {
      throw new Error('not used by hyperlocalSpotlight.service tests — writes go through article.repository.ts');
    },
  };
}

describe('HyperlocalSpotlightService — public read', () => {
  it('serves the editor pick when it is publicly visible', async () => {
    const pick = article({ id: 'p' });
    const newer = article({ id: 'n', publishedAt: new Date('2026-02-01T00:00:00Z') });
    const spotlight = createFakeSpotlightRepository('p');
    const { repository } = createFakeArticleRepository([pick, newer]);
    const service = createHyperlocalSpotlightService(spotlight, repository, env);

    const result = await service.getPublic();

    expect(result.article?.id).toBe('p');
    expect(result.isEditorPick).toBe(true);
  });

  it('falls back to the newest published article when no editor pick is stored', async () => {
    const older = article({ id: 'o', publishedAt: new Date('2026-01-01T00:00:00Z') });
    const newest = article({ id: 'n', publishedAt: new Date('2026-02-01T00:00:00Z') });
    const spotlight = createFakeSpotlightRepository(null);
    const { repository } = createFakeArticleRepository([older, newest]);
    const service = createHyperlocalSpotlightService(spotlight, repository, env);

    const result = await service.getPublic();

    expect(result.article?.id).toBe('n');
    expect(result.isEditorPick).toBe(false);
  });

  it('falls back when the editor pick is a draft, without disclosing it', async () => {
    const draftPick = article({ id: 'd', status: 'draft', publishedAt: null });
    const published = article({ id: 'p', publishedAt: new Date('2026-01-01T00:00:00Z') });
    const spotlight = createFakeSpotlightRepository('d');
    const { repository } = createFakeArticleRepository([draftPick, published]);
    const service = createHyperlocalSpotlightService(spotlight, repository, env);

    const result = await service.getPublic();

    expect(result.article?.id).toBe('p');
    expect(result.isEditorPick).toBe(false);
  });

  it('a scheduled editor pick whose time has passed is served as the pick, not the fallback', async () => {
    const due = article({ id: 's', status: 'scheduled', publishedAt: new Date(Date.now() - 60_000) });
    const older = article({ id: 'o', publishedAt: new Date('2020-01-01T00:00:00Z') });
    const spotlight = createFakeSpotlightRepository('s');
    const { repository } = createFakeArticleRepository([due, older]);
    const service = createHyperlocalSpotlightService(spotlight, repository, env);

    const result = await service.getPublic();

    expect(result.article?.id).toBe('s');
    expect(result.isEditorPick).toBe(true);
  });

  it('reports no article when nothing is publicly visible at all', async () => {
    const draftOnly = article({ id: 'd', status: 'draft', publishedAt: null });
    const spotlight = createFakeSpotlightRepository(null);
    const { repository } = createFakeArticleRepository([draftOnly]);
    const service = createHyperlocalSpotlightService(spotlight, repository, env);

    const result = await service.getPublic();

    expect(result.article).toBeNull();
    expect(result.isEditorPick).toBe(false);
  });

  it('issues no fallback query when the editor pick alone is enough', async () => {
    const pick = article({ id: 'p' });
    const spotlight = createFakeSpotlightRepository('p');
    const { repository, listPublishedCalls } = createFakeArticleRepository([pick]);
    const service = createHyperlocalSpotlightService(spotlight, repository, env);

    await service.getPublic();

    expect(listPublishedCalls).toHaveLength(0);
  });
});

describe('HyperlocalSpotlightService — admin read', () => {
  it('reports an invisible editor pick alongside what is currently shown publicly', async () => {
    const draftPick = article({ id: 'd', title: 'Draft Pick', status: 'draft', publishedAt: null });
    const published = article({ id: 'p', title: 'Published', publishedAt: new Date('2026-01-01T00:00:00Z') });
    const spotlight = createFakeSpotlightRepository('d');
    const { repository } = createFakeArticleRepository([draftPick, published]);
    const service = createHyperlocalSpotlightService(spotlight, repository, env);

    const result = await service.getAdmin();

    expect(result.editorPick?.article.id).toBe('d');
    expect(result.editorPick?.isPubliclyVisible).toBe(false);
    expect(result.resolved?.id).toBe('p');
    expect(result.resolvedIsEditorPick).toBe(false);
  });

  it('reports no editor pick and no resolved article when the slot is empty and nothing is published', async () => {
    const spotlight = createFakeSpotlightRepository(null);
    const { repository } = createFakeArticleRepository([]);
    const service = createHyperlocalSpotlightService(spotlight, repository, env);

    const result = await service.getAdmin();

    expect(result.editorPick).toBeNull();
    expect(result.resolved).toBeNull();
    expect(result.resolvedIsEditorPick).toBe(false);
  });

  it('reports a visible editor pick as both the pick and the resolved article', async () => {
    const pick = article({ id: 'p' });
    const spotlight = createFakeSpotlightRepository('p');
    const { repository } = createFakeArticleRepository([pick]);
    const service = createHyperlocalSpotlightService(spotlight, repository, env);

    const result = await service.getAdmin();

    expect(result.editorPick?.article.id).toBe('p');
    expect(result.editorPick?.isPubliclyVisible).toBe(true);
    expect(result.resolved?.id).toBe('p');
    expect(result.resolvedIsEditorPick).toBe(true);
  });
});
