import { asc, eq } from 'drizzle-orm';
import { articles, homeCuration, type Database } from '@siders/db';
import type { ArticleStatus } from '@siders/contracts';
import { AppError } from '../../middleware/errorHandler.js';
import { isForeignKeyViolation } from '../../lib/pgErrors.js';

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

type Executor = Database | Parameters<Parameters<Database['transaction']>[0]>[0];

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

    async replace(articleIds) {
      try {
        return await db.transaction(async (tx) => {
          await tx.delete(homeCuration);
          if (articleIds.length > 0) {
            await tx.insert(homeCuration).values(articleIds.map((articleId, position) => ({ articleId, position })));
          }
          return selectJoined(tx);
        });
      } catch (err) {
        if (isForeignKeyViolation(err)) throw invalidArticleReferenceError();
        throw err;
      }
    },
  };
}
