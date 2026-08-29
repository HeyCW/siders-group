import { asc, eq } from 'drizzle-orm';
import { articles, homeCuration } from '@siders/db';
import { AppError } from '../../middleware/errorHandler.js';
import { replaceOrdering } from '../../lib/replaceOrdering.js';
function invalidArticleReferenceError() {
    return new AppError('One or more article ids do not exist', 400, 'invalid_article_reference');
}
async function selectJoined(executor) {
    return executor
        .select({
        articleId: homeCuration.articleId,
        position: homeCuration.position,
        title: articles.title,
        slug: articles.slug,
        status: articles.status,
        publishedAt: articles.publishedAt,
    })
        .from(homeCuration)
        .innerJoin(articles, eq(articles.id, homeCuration.articleId))
        .orderBy(asc(homeCuration.position));
}
export function createHomeCurationRepository(db) {
    return {
        list() {
            return selectJoined(db);
        },
        replace(articleIds) {
            // Lock ordering, deadlock/race rationale, and error translation all live in
            // `replaceOrdering` now — see its doc comment for the full account of both failure modes
            // this shape avoids (reproduced and verified against a live Postgres 16 when this pattern
            // was first written for `home_curation`).
            return replaceOrdering({
                db,
                ids: articleIds,
                referencedTable: 'articles',
                orderingTable: 'home_curation',
                deleteAll: (tx) => tx.delete(homeCuration),
                insertOrdered: (tx, ids) => tx.insert(homeCuration).values(ids.map((articleId, position) => ({ articleId, position }))),
                selectJoined,
                onInvalidReference: invalidArticleReferenceError,
            });
        },
    };
}
