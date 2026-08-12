import type { ArticlePublicCard } from '@siders/contracts';
import type { Env } from '../../config/env.js';
import { isPubliclyVisible, type ArticleRepository, type ArticleWithRelations } from '../articles/article.repository.js';
import { toPublicCard } from '../articles/article.mapper.js';
import type { HomeCurationRepository } from './curation.repository.js';

type MediaUrlEnv = Pick<Env, 'MEDIA_PUBLIC_BASE_URL'>;

export interface HomeFeedService {
  /**
   * Visible curated picks first, in stored order, then the most recently published articles
   * backfilling the remainder — composed here, server-side, so no consumer has to know a curated
   * pick might be invisible or compute what to exclude from the remainder
   * (specs/home-curation/spec.md - "Composition happens server-side").
   */
  getFeed(limit: number): Promise<ArticlePublicCard[]>;
}

export function createHomeFeedService(
  curationRepository: HomeCurationRepository,
  articleRepository: ArticleRepository,
  env: MediaUrlEnv,
): HomeFeedService {
  return {
    async getFeed(limit) {
      const now = new Date();
      const entries = await curationRepository.list();

      // Filter first, preserving stored order, then take the head — an invisible entry is
      // dropped entirely rather than counted, so the remaining curated picks keep their relative
      // order at the front of the feed (specs/home-curation/spec.md - "Remaining curated order
      // is preserved").
      const visibleEntries = entries
        .filter((entry) => isPubliclyVisible({ status: entry.status, publishedAt: entry.publishedAt }, now))
        .slice(0, limit);

      const headIds = visibleEntries.map((entry) => entry.articleId);
      const headArticles =
        headIds.length > 0 ? await articleRepository.findManyPubliclyVisible(headIds, now) : [];
      const articleById = new Map(headArticles.map((article) => [article.id, article]));
      // `findManyPubliclyVisible` makes no ordering guarantee, so the curated order is restored
      // here. An entry whose article failed to resolve (a race with a concurrent delete) is
      // simply dropped rather than gapped.
      const orderedHead = visibleEntries
        .map((entry) => articleById.get(entry.articleId))
        .filter((article): article is ArticleWithRelations => article !== undefined);

      // No backfill query when the curated head alone fills the limit
      // (specs/home-curation/spec.md - "Feed is filled to the limit"; tasks.md - 4.6).
      const remaining = limit - orderedHead.length;
      const backfill =
        remaining > 0
          ? await articleRepository.listPublished({
              limit: remaining,
              offset: 0,
              excludeIds: orderedHead.map((article) => article.id),
              now,
            })
          : [];

      return [...orderedHead, ...backfill].map((article) => toPublicCard(env, article));
    },
  };
}
