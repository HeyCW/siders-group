import type { HomeCurationArticleSummary } from '@siders/contracts';
import type { ArticleWithRelations } from '../articles/article.repository.js';

/** The bare `{id, title, slug}` shape shared by the admin spotlight response's `editorPick` and
 *  `resolved` fields — reuses `home-curation`'s summary shape rather than declaring a new one. */
export function toArticleSummary(article: ArticleWithRelations): HomeCurationArticleSummary {
  return { id: article.id, title: article.title, slug: article.slug };
}
