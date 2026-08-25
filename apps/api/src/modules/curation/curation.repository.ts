import { asc, eq } from 'drizzle-orm';
import { articles, homeCuration, type Database } from '@siders/db';
import type { ArticleStatus } from '@siders/contracts';
import { AppError } from '../../middleware/errorHandler.js';
import { replaceOrdering, type OrderingExecutor } from '../../lib/replaceOrdering.js';

/**
 * Wider than `OrderingExecutor`: `selectJoined` below is reused both as a `replaceOrdering`
 * config field (always called with its transaction's `tx`, which is exactly what
 * `OrderingExecutor` requires) and standalone from `list()`, where there's no transaction to be
 * in and the plain pool is correct. `OrderingExecutor` itself stays transaction-only so
 * `ReplaceOrderingConfig`'s fields keep catching a bare-pool passed where the lock's correctness
 * would silently break.
 */
type Executor = Database | OrderingExecutor;

export interface HomeCurationEntryRow {
  articleId: string;
  position: number;
  title: string;
  slug: string;
  status: ArticleStatus;
  publishedAt: Date | null;
}

export interface HomeCurationRepository {
  /** Every stored entry, in position order, joined with enough of the article to report status and visibility. */
  list(): Promise<HomeCurationEntryRow[]>;
  /**
   * Whole-list replacement in a single transaction: delete every existing row, then insert one
   * row per id with `position` set to its index in `articleIds`
   * (specs/home-curation/spec.md - "Curation is replaced as a whole list"). An id that names no
   * article throws `invalid_article_reference`; the previous list is left untouched.
   */
  replace(articleIds: string[]): Promise<HomeCurationEntryRow[]>;
}

function invalidArticleReferenceError(): AppError {
  return new AppError('One or more article ids do not exist', 400, 'invalid_article_reference');
}

async function selectJoined(executor: Executor): Promise<HomeCurationEntryRow[]> {
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

export function createHomeCurationRepository(db: Database): HomeCurationRepository {
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
        insertOrdered: (tx, ids) =>
          tx.insert(homeCuration).values(ids.map((articleId, position) => ({ articleId, position }))),
        selectJoined,
        onInvalidReference: invalidArticleReferenceError,
      });
    },
  };
}
