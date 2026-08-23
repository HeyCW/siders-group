import type { ArticleAdminResponse, ArticlePublicCard, ArticlePublicDetail, CategoryResponse } from '@siders/contracts';
import { publicUrlFor } from '../../lib/mediaStorage.js';
import { excerptFromHtml } from '../../lib/htmlExcerpt.js';
import type { ArticleWithRelations, TaxonomyRef } from './article.repository.js';

type MediaUrlEnv = { MEDIA_PUBLIC_BASE_URL: string };

/** Cards read comfortably at this length without dwarfing the title on narrow layouts. */
const CARD_EXCERPT_LENGTH = 160;

function toTaxonomyResponse(refs: TaxonomyRef[]): CategoryResponse[] {
  return refs.map(({ id, name, slug }) => ({ id, name, slug }));
}

function featuredImageUrl(env: MediaUrlEnv, article: ArticleWithRelations): string | null {
  return article.featuredMediaStoragePath ? publicUrlFor(env, article.featuredMediaStoragePath) : null;
}

/**
 * Falls back to a snippet of the sanitized body when staff never filled in `excerpt`, so a card
 * still shows a preview instead of just a bare title.
 */
function cardExcerpt(article: ArticleWithRelations): string | null {
  if (article.excerpt && article.excerpt.trim().length > 0) return article.excerpt;
  const fallback = excerptFromHtml(article.bodyHtml, CARD_EXCERPT_LENGTH);
  return fallback.length > 0 ? fallback : null;
}

/** The public card shape used by both the list endpoint and the detail response it extends. */
export function toPublicCard(env: MediaUrlEnv, article: ArticleWithRelations): ArticlePublicCard {
  if (!article.publishedAt) {
    throw new Error(`article ${article.id} has no publishedAt but was mapped as publicly visible`);
  }
  return {
    id: article.id,
    slug: article.slug,
    title: article.title,
    excerpt: cardExcerpt(article),
    featuredImageUrl: featuredImageUrl(env, article),
    categories: toTaxonomyResponse(article.categories),
    anakUsaha: article.anakUsaha,
    authorName: article.authorName,
    publishedAt: article.publishedAt.toISOString(),
  };
}

/**
 * `bodyHtml` only — never `bodyJson` (specs/article-management/spec.md - "Only sanitized HTML
 * is served publicly").
 */
export function toPublicDetail(env: MediaUrlEnv, article: ArticleWithRelations): ArticlePublicDetail {
  return {
    ...toPublicCard(env, article),
    bodyHtml: article.bodyHtml,
    seoTitle: article.seoTitle,
    seoDescription: article.seoDescription,
  };
}

/** The admin-facing shape: everything public gets, plus authoring state and `bodyJson`. */
export function toAdminResponse(env: MediaUrlEnv, article: ArticleWithRelations): ArticleAdminResponse {
  return {
    id: article.id,
    title: article.title,
    slug: article.slug,
    bodyJson: article.bodyJson,
    bodyHtml: article.bodyHtml,
    excerpt: article.excerpt,
    status: article.status,
    authorId: article.authorId,
    authorName: article.authorName,
    featuredMediaId: article.featuredMediaId,
    featuredImageUrl: featuredImageUrl(env, article),
    categories: toTaxonomyResponse(article.categories),
    anakUsaha: article.anakUsaha,
    seoTitle: article.seoTitle,
    seoDescription: article.seoDescription,
    publishedAt: article.publishedAt ? article.publishedAt.toISOString() : null,
    createdAt: article.createdAt.toISOString(),
    updatedAt: article.updatedAt.toISOString(),
  };
}

/**
 * Preview: the same shape the public detail endpoint returns, but callable regardless of
 * status and without the visibility filter — the caller already holds `news.manage`
 * (specs/article-management/spec.md - "Article preview").
 */
export function toPreviewResponse(env: MediaUrlEnv, article: ArticleWithRelations): ArticlePublicDetail {
  return {
    id: article.id,
    slug: article.slug,
    title: article.title,
    excerpt: cardExcerpt(article),
    featuredImageUrl: featuredImageUrl(env, article),
    categories: toTaxonomyResponse(article.categories),
    anakUsaha: article.anakUsaha,
    authorName: article.authorName,
    publishedAt: article.publishedAt ? article.publishedAt.toISOString() : new Date(0).toISOString(),
    bodyHtml: article.bodyHtml,
    seoTitle: article.seoTitle,
    seoDescription: article.seoDescription,
  };
}
