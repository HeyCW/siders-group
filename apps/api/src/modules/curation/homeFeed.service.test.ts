import { describe, expect, it } from 'vitest';
import { isPubliclyVisible, type ArticleRepository, type ArticleWithRelations, type PublicListFilter } from '../articles/article.repository.js';
import { createHomeFeedService } from './homeFeed.service.js';
import type { HomeCurationEntryRow, HomeCurationRepository } from './curation.repository.js';

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
    seoTitle: null,
    seoDescription: null,
    publishedAt: new Date('2026-01-01T00:00:00Z'),
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    authorName: 'Jane Author',
    featuredMediaStoragePath: null,
    categories: [],
    tags: [],
    ...overrides,
  };
}

function curationEntry(a: ArticleWithRelations, position: number): HomeCurationEntryRow {
  return { articleId: a.id, position, title: a.title, slug: a.slug, status: a.status, publishedAt: a.publishedAt };
}

/** A fake covering only what the feed service calls; every other method is unused here. */
function createFakeArticleRepository(articles: ArticleWithRelations[]) {
  const listPublishedCalls: PublicListFilter[] = [];
  const byId = new Map(articles.map((a) => [a.id, a]));
  const repository: ArticleRepository = {
    create: () => {
      throw new Error('not used by homeFeed.service tests');
    },
    update: () => {
      throw new Error('not used by homeFeed.service tests');
    },
    updateStatus: () => {
      throw new Error('not used by homeFeed.service tests');
    },
    findById: () => {
      throw new Error('not used by homeFeed.service tests');
    },
    listAdmin: () => {
      throw new Error('not used by homeFeed.service tests');
    },
    delete: () => {
      throw new Error('not used by homeFeed.service tests');
    },
    slugExists: () => {
      throw new Error('not used by homeFeed.service tests');
    },
    findDueScheduled: () => {
      throw new Error('not used by homeFeed.service tests');
    },
    findPublishedBySlug: () => {
      throw new Error('not used by homeFeed.service tests');
    },
    promoteScheduled: () => {
      throw new Error('not used by homeFeed.service tests');
    },
    async findManyPubliclyVisible(ids, now) {
      return ids
        .map((id) => byId.get(id))
        .filter((a): a is ArticleWithRelations => a !== undefined && isPubliclyVisible(a, now));
    },
    async listPublished(filter) {
      listPublishedCalls.push(filter);
      const exclude = new Set(filter.excludeIds ?? []);
      return articles
        .filter((a) => isPubliclyVisible(a, filter.now) && !exclude.has(a.id))
        .sort((a, b) => (b.publishedAt?.getTime() ?? 0) - (a.publishedAt?.getTime() ?? 0))
        .slice(filter.offset, filter.offset + filter.limit);
    },
  };
  return { repository, listPublishedCalls };
}

function createFakeCurationRepository(entries: HomeCurationEntryRow[]): HomeCurationRepository {
  return {
    async list() {
      return entries;
    },
    replace: () => {
      throw new Error('not used by homeFeed.service tests');
    },
  };
}

describe('HomeFeedService', () => {
  it('curated articles lead the feed and the remainder is filled chronologically', async () => {
    const a = article({ id: 'a', publishedAt: new Date('2026-01-01T00:00:00Z') });
    const b = article({ id: 'b', publishedAt: new Date('2026-01-03T00:00:00Z') });
    const c = article({ id: 'c', publishedAt: new Date('2026-01-02T00:00:00Z') });
    const curation = createFakeCurationRepository([curationEntry(a, 0)]);
    const { repository: articleRepo } = createFakeArticleRepository([a, b, c]);
    const service = createHomeFeedService(curation, articleRepo, env);

    const feed = await service.getFeed(10);

    // 'a' leads despite being the oldest — it is curated. 'b' then 'c' follow by recency.
    expect(feed.map((card) => card.id)).toEqual(['a', 'b', 'c']);
  });

  it('a curated article never appears twice, even though it would also qualify for the chronological remainder', async () => {
    const a = article({ id: 'a', publishedAt: new Date('2026-01-05T00:00:00Z') });
    const b = article({ id: 'b', publishedAt: new Date('2026-01-01T00:00:00Z') });
    const curation = createFakeCurationRepository([curationEntry(a, 0)]);
    const { repository: articleRepo, listPublishedCalls } = createFakeArticleRepository([a, b]);
    const service = createHomeFeedService(curation, articleRepo, env);

    const feed = await service.getFeed(10);

    expect(feed.filter((card) => card.id === 'a')).toHaveLength(1);
    expect(listPublishedCalls[0]?.excludeIds).toEqual(['a']);
  });

  it('a draft curated article is absent from the feed', async () => {
    const draft = article({ id: 'd', status: 'draft', publishedAt: null });
    const curation = createFakeCurationRepository([curationEntry(draft, 0)]);
    const { repository: articleRepo } = createFakeArticleRepository([draft]);
    const service = createHomeFeedService(curation, articleRepo, env);

    const feed = await service.getFeed(10);

    expect(feed).toEqual([]);
  });

  it('a scheduled curated article whose time has passed appears, exercising the shared visibility predicate', async () => {
    const due = article({ id: 's', status: 'scheduled', publishedAt: new Date(Date.now() - 60_000) });
    const curation = createFakeCurationRepository([curationEntry(due, 0)]);
    const { repository: articleRepo } = createFakeArticleRepository([due]);
    const service = createHomeFeedService(curation, articleRepo, env);

    const feed = await service.getFeed(10);

    expect(feed.map((card) => card.id)).toEqual(['s']);
  });

  it('remaining curated articles keep their relative order when one becomes invisible', async () => {
    const a = article({ id: 'a', publishedAt: new Date('2026-01-01T00:00:00Z') });
    const invisible = article({ id: 'x', status: 'draft', publishedAt: null });
    const b = article({ id: 'b', publishedAt: new Date('2026-01-02T00:00:00Z') });
    const curation = createFakeCurationRepository([curationEntry(a, 0), curationEntry(invisible, 1), curationEntry(b, 2)]);
    const { repository: articleRepo } = createFakeArticleRepository([a, invisible, b]);
    const service = createHomeFeedService(curation, articleRepo, env);

    const feed = await service.getFeed(10);

    expect(feed.map((card) => card.id)).toEqual(['a', 'b']);
  });

  it('stays filled to the requested limit when a curated pick becomes invisible and enough other published articles exist', async () => {
    const a = article({ id: 'a', publishedAt: new Date('2026-01-01T00:00:00Z') });
    const invisible = article({ id: 'x', status: 'draft', publishedAt: null });
    const b = article({ id: 'b', publishedAt: new Date('2026-01-02T00:00:00Z') });
    const backfillSource = Array.from({ length: 4 }, (_, i) =>
      article({ id: `bf${i}`, publishedAt: new Date(`2026-02-0${i + 1}T00:00:00Z`) }),
    );
    const curation = createFakeCurationRepository([curationEntry(a, 0), curationEntry(invisible, 1), curationEntry(b, 2)]);
    const { repository: articleRepo } = createFakeArticleRepository([a, invisible, b, ...backfillSource]);
    const service = createHomeFeedService(curation, articleRepo, env);

    const feed = await service.getFeed(5);

    expect(feed).toHaveLength(5);
    expect(feed.slice(0, 2).map((card) => card.id)).toEqual(['a', 'b']);
  });

  it('an empty curated list yields a purely chronological feed', async () => {
    const a = article({ id: 'a', publishedAt: new Date('2026-01-01T00:00:00Z') });
    const b = article({ id: 'b', publishedAt: new Date('2026-01-02T00:00:00Z') });
    const curation = createFakeCurationRepository([]);
    const { repository: articleRepo } = createFakeArticleRepository([a, b]);
    const service = createHomeFeedService(curation, articleRepo, env);

    const feed = await service.getFeed(10);

    expect(feed.map((card) => card.id)).toEqual(['b', 'a']);
  });

  it('fills to the requested limit when curated picks are fewer than the limit', async () => {
    const a = article({ id: 'a', publishedAt: new Date('2026-01-01T00:00:00Z') });
    const others = Array.from({ length: 5 }, (_, i) =>
      article({ id: `o${i}`, publishedAt: new Date(`2026-01-0${i + 2}T00:00:00Z`) }),
    );
    const curation = createFakeCurationRepository([curationEntry(a, 0)]);
    const { repository: articleRepo } = createFakeArticleRepository([a, ...others]);
    const service = createHomeFeedService(curation, articleRepo, env);

    const feed = await service.getFeed(4);

    expect(feed).toHaveLength(4);
  });

  it('issues no backfill query when the curated head alone fills the limit', async () => {
    const a = article({ id: 'a' });
    const b = article({ id: 'b' });
    const c = article({ id: 'c' });
    const curation = createFakeCurationRepository([curationEntry(a, 0), curationEntry(b, 1), curationEntry(c, 2)]);
    const { repository: articleRepo, listPublishedCalls } = createFakeArticleRepository([a, b, c]);
    const service = createHomeFeedService(curation, articleRepo, env);

    const feed = await service.getFeed(2);

    expect(feed.map((card) => card.id)).toEqual(['a', 'b']);
    expect(listPublishedCalls).toHaveLength(0);
  });

  it('an unpublished curated article drops out; republishing restores it to its stored position', async () => {
    const curated = article({ id: 'p', status: 'published' });
    const before = article({ id: 'before', publishedAt: new Date('2026-01-01T00:00:00Z') });
    const after = article({ id: 'after', publishedAt: new Date('2026-01-02T00:00:00Z') });
    const curation = createFakeCurationRepository([curationEntry(curated, 0)]);

    const unpublished = { ...curated, status: 'draft' as const, publishedAt: null };
    const { repository: whileUnpublished } = createFakeArticleRepository([unpublished, before, after]);
    const serviceWhileUnpublished = createHomeFeedService(curation, whileUnpublished, env);
    expect((await serviceWhileUnpublished.getFeed(10)).some((c) => c.id === 'p')).toBe(false);

    const { repository: whilePublished } = createFakeArticleRepository([curated, before, after]);
    const serviceWhilePublished = createHomeFeedService(curation, whilePublished, env);
    const feed = await serviceWhilePublished.getFeed(10);
    expect(feed[0]?.id).toBe('p');
  });
});
