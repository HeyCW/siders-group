import { and, count, desc, eq, sql } from 'drizzle-orm';
import { articles, comments, likes, newId, readers, type Database } from '@siders/db';
import { isUniqueViolation } from '../../lib/dbErrors.js';
import { isPubliclyVisible } from '../articles/article.repository.js';

/** The `mysql2` driver's insert/update/delete result shape, as returned by `db.execute(sql\`...\`)`
 *  and by a plain (non-`.returning()`) Drizzle write — see
 *  openspec/changes/migrate-postgres-to-mysql/design.md, "`db.execute()` returns a different
 *  shape": `pg` gave `{ rows, rowCount }`, `mysql2` gives `[rows-or-header, fields]`. */
interface MySqlWriteResult {
  affectedRows: number;
}

export interface CommentRow {
  id: string;
  body: string;
  authorName: string;
  authorAvatarUrl: string | null;
  createdAt: Date;
}

export interface EngagementCounts {
  viewCount: number;
  likeCount: number;
  commentCount: number;
}

export interface EngagementRepository {
  /**
   * Whether an article exists *and* is publicly visible right now. Returns a boolean rather than
   * a row because no caller here needs anything off the article itself — only permission to act
   * on it (specs/article-engagement/spec.md - "Engagement endpoints act only on publicly visible
   * articles").
   */
  isArticleEngageable(articleId: string, now: Date): Promise<boolean>;
  /** The `docs/ARCHITECTURE.md` §9.1 pair, in one transaction. Resolves to whether this visitor
   *  was newly counted as unique for the day — returned for testability, not used by the caller. */
  recordView(articleId: string, visitorHash: string): Promise<boolean>;
  /** Resolves to the *resulting* state: `true` when the reader now holds a like. */
  toggleLike(articleId: string, readerId: string): Promise<boolean>;
  hasLiked(articleId: string, readerId: string): Promise<boolean>;
  getCounts(articleId: string): Promise<EngagementCounts>;
  createComment(articleId: string, readerId: string, body: string): Promise<CommentRow>;
  listComments(articleId: string, limit: number, offset: number): Promise<CommentRow[]>;
}

const COMMENT_SELECT_COLUMNS = {
  id: comments.id,
  body: comments.body,
  authorName: readers.name,
  authorAvatarUrl: readers.avatarUrl,
  createdAt: comments.createdAt,
};

/**
 * The public comment predicate, in one place. `removed` is written only by a staff member editing
 * the row directly (proposal.md - Moderation), so this filter is the entire difference between a
 * removed comment and a deleted one — and the listing and the count must never disagree about it
 * (specs/article-engagement/spec.md - "The comment count matches the listing").
 */
function visibleComments(articleId: string) {
  return and(eq(comments.articleId, articleId), eq(comments.status, 'visible'));
}

export function createEngagementRepository(db: Database): EngagementRepository {
  return {
    async isArticleEngageable(articleId, now) {
      // Selects the two columns the predicate needs and evaluates `isPubliclyVisible` in JS
      // rather than rebuilding the visibility rule as a second `where` clause. That rule has
      // exactly one SQL definition, private to `article.repository.ts`, and one JS definition,
      // exported from it — specs/public-news-api/spec.md's "One canonical public visibility rule"
      // is why this reuses the latter instead of adding a third.
      const [row] = await db
        .select({ status: articles.status, publishedAt: articles.publishedAt })
        .from(articles)
        .where(eq(articles.id, articleId))
        .limit(1);
      return row !== undefined && isPubliclyVisible(row, now);
    },

    async recordView(articleId, visitorHash) {
      // `docs/ARCHITECTURE.md` §9.1, as written: two statements, one transaction, no locks held.
      // The uniqueness decision is the first insert's affected-row count — a row that conflicts
      // means this visitor was already counted for this article today.
      //
      // `on conflict do nothing` → `insert ignore`; `current_date` → `curdate()`, resolved in the
      // MySQL session's own time zone, which `packages/db/src/client.ts` pins to UTC with an
      // explicit `SET SESSION time_zone = '+00:00'` on connection — `timezone: 'Z'` alone would
      // *not* do this, since that option only governs how the driver formats/parses JS `Date`s,
      // not how the server evaluates a server-side function like `curdate()`. Matching this
      // table's own schema comment on why that shifts which *day* a view lands in but never
      // whether it's counted. `on conflict ... do update set x = x + n` → `on duplicate key
      // update x = x + n`, with `values(unique_views)` standing in for the excluded-row reference
      // Postgres's `EXCLUDED`/target-table-qualified form would use.
      return db.transaction(async (tx) => {
        const [seen] = (await tx.execute(sql`
          insert ignore into view_seen (article_id, visitor_hash, date)
          values (${articleId}, ${visitorHash}, curdate())
        `)) as unknown as [MySqlWriteResult, unknown];
        const uniqueDelta = seen.affectedRows > 0 ? 1 : 0;

        await tx.execute(sql`
          insert into article_views_daily (article_id, date, views, unique_views)
          values (${articleId}, curdate(), 1, ${uniqueDelta})
          on duplicate key update
            views        = views + 1,
            unique_views = unique_views + values(unique_views)
        `);

        return uniqueDelta === 1;
      });
    },

    async toggleLike(articleId, readerId) {
      const [deleted] = await db
        .delete(likes)
        .where(and(eq(likes.readerId, readerId), eq(likes.articleId, articleId)));
      if (deleted.affectedRows > 0) return false;

      try {
        await db.insert(likes).values({ id: newId(), readerId, articleId });
      } catch (err) {
        // Two of this reader's own requests raced: both deleted nothing, both tried to insert,
        // one lost on `likes_reader_article_unique`. The reader's intent — a like — is satisfied
        // either way, so this is the outcome, not a failure. Any other error still throws.
        if (!isUniqueViolation(err)) throw err;
      }
      return true;
    },

    async hasLiked(articleId, readerId) {
      const [row] = await db
        .select({ id: likes.id })
        .from(likes)
        .where(and(eq(likes.readerId, readerId), eq(likes.articleId, articleId)))
        .limit(1);
      return row !== undefined;
    },

    async getCounts(articleId) {
      // Three independent aggregates over three tables, issued together rather than sequentially:
      // this runs on every article page load, so the latency is the sum of one round trip, not
      // three.
      const [viewRows, likeRows, commentRows] = await Promise.all([
        db.execute(sql`
          select coalesce(sum(views), 0) as views
          from article_views_daily
          where article_id = ${articleId}
        `) as unknown as Promise<[{ views: string | number | null }[], unknown]>,
        db.select({ value: count() }).from(likes).where(eq(likes.articleId, articleId)),
        db.select({ value: count() }).from(comments).where(visibleComments(articleId)),
      ]);
      const [viewSumRows] = viewRows;

      return {
        // `sum()` of an `integer` column comes back as `bigint`; `supportBigNumbers` in
        // `packages/db/src/client.ts` avoids silent precision loss the same way `node-postgres`
        // returning it as a string did — `Number(...)` here rather than trusting the column type.
        viewCount: Number(viewSumRows[0]?.views ?? 0),
        likeCount: likeRows[0]?.value ?? 0,
        commentCount: commentRows[0]?.value ?? 0,
      };
    },

    async createComment(articleId, readerId, body) {
      const id = newId();
      await db.insert(comments).values({ id, articleId, readerId, body });

      const [row] = await db
        .select(COMMENT_SELECT_COLUMNS)
        .from(comments)
        .innerJoin(readers, eq(readers.id, comments.readerId))
        .where(eq(comments.id, id))
        .limit(1);
      if (!row) throw new Error('comment missing immediately after insert');
      return row;
    },

    listComments(articleId, limit, offset) {
      return db
        .select(COMMENT_SELECT_COLUMNS)
        .from(comments)
        .innerJoin(readers, eq(readers.id, comments.readerId))
        .where(visibleComments(articleId))
        // `id` breaks ties on `created_at`: two comments inserted in the same transaction-clock
        // tick would otherwise order arbitrarily, and an unstable sort under limit/offset paging
        // silently duplicates or drops a row across pages.
        .orderBy(desc(comments.createdAt), desc(comments.id))
        .limit(limit)
        .offset(offset);
    },
  };
}
