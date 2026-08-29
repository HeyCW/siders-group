import { isPubliclyVisible } from '../articles/article.repository.js';
/**
 * Reuses `isPubliclyVisible` — the article module's own JS-side twin of the canonical SQL
 * visibility predicate — rather than re-deriving what "currently live" means
 * (specs/home-curation/spec.md - "Public visibility is not re-derived").
 */
export function toHomeCurationEntryResponse(entry, now) {
    return {
        article: { id: entry.articleId, title: entry.title, slug: entry.slug },
        status: entry.status,
        position: entry.position,
        isPubliclyVisible: isPubliclyVisible({ status: entry.status, publishedAt: entry.publishedAt }, now),
    };
}
