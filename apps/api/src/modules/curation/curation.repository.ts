import { asc, eq, sql } from 'drizzle-orm';
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
          // Lock the referenced article rows *before* the home_curation table. The cycle only
          // arises when the concurrent delete targets an article that is itself in this
          // replace's submitted list: a hard delete takes that article's row lock first and only
          // then needs a lock on home_curation (to run the ON DELETE CASCADE), while the old
          // ordering here took the table lock first and only then needed the same article's row
          // lock (via the INSERT's foreign-key check) — an unavoidable 40P01 deadlock that
          // reached the caller as a 500 for a save that, from the editor's side, looked identical
          // to a normal one. Deleting an article that is *not* in the submitted list never hits
          // this cycle, since nothing here takes a lock on it. Matching the delete path's lock
          // order removes the cycle for the case that does collide. Reproduced and verified
          // against a live Postgres 16: without this, a concurrent replace and a delete of one of
          // its own submitted articles reliably deadlocked; with it, the loser of the row lock
          // simply waits for the winner to commit.
          if (articleIds.length > 0) {
            const rows = await tx.execute(sql`
              select id from app.articles
              where id in (${sql.join(
                articleIds.map((id) => sql`${id}`),
                sql`, `,
              )})
              for key share
            `);
            if (rows.rows.length !== articleIds.length) throw invalidArticleReferenceError();
          }
          // Serializes concurrent replaces so the second writer's DELETE runs against a fresh
          // snapshot that already includes the first writer's committed INSERT, rather than
          // racing it. Without this, two overlapping PUTs can both pass their DELETE before
          // either INSERTs, and the second INSERT then collides with the first's rows on
          // `home_curation_pkey` or `home_curation_position_unique` — an unhandled 23505
          // surfacing as a 500, not the last-write-wins design.md promises ("two editors saving
          // concurrently is last-write-wins on the entire list, not a per-item merge"). Safe to
          // take after the row locks above: FOR KEY SHARE is a shared lock, so two concurrent
          // replaces never block each other there, only at this table lock, in whichever order
          // they arrive.
          await tx.execute(sql`LOCK TABLE app.home_curation IN EXCLUSIVE MODE`);
          await tx.delete(homeCuration);
          if (articleIds.length > 0) {
            await tx.insert(homeCuration).values(articleIds.map((articleId, position) => ({ articleId, position })));
          }
          return selectJoined(tx);
        });
      } catch (err) {
        if (err instanceof AppError) throw err;
        if (isForeignKeyViolation(err)) throw invalidArticleReferenceError();
        throw err;
      }
    },
  };
}
