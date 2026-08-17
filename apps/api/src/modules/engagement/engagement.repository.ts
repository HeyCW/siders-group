import { and, count, desc, eq, sql } from 'drizzle-orm';
import { articles, comments, likes, readers, type Database } from '@siders/db';
import { isUniqueViolation } from '../../lib/pgErrors.js';
import { isPubliclyVisible } from '../articles/article.repository.js';

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
      return db.transaction(async (tx) => {
        const seen = await tx.execute(sql`
          insert into app.view_seen (article_id, visitor_hash, date)
          values (${articleId}, ${visitorHash}, current_date)
          on conflict do nothing
        `);
        const uniqueDelta = (seen.rowCount ?? 0) > 0 ? 1 : 0;

        await tx.execute(sql`
          insert into app.article_views_daily (article_id, date, views, unique_views)
          values (${articleId}, current_date, 1, ${uniqueDelta}::int)
          on conflict (article_id, date) do update
            set views        = app.article_views_daily.views + 1,
                unique_views = app.article_views_daily.unique_views + ${uniqueDelta}::int
        `);

        return uniqueDelta === 1;
      });
    },

    async toggleLike(articleId, readerId) {
      const deleted = await db
        .delete(likes)
        .where(and(eq(likes.readerId, readerId), eq(likes.articleId, articleId)))
        .returning({ id: likes.id });
      if (deleted.length > 0) return false;

      try {
        await db.insert(likes).values({ readerId, articleId });
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
        db.execute<{ views: string | number | null }>(sql`
          select coalesce(sum(views), 0) as views
          from app.article_views_daily
          where article_id = ${articleId}
        `),
        db.select({ value: count() }).from(likes).where(eq(likes.articleId, articleId)),
        db.select({ value: count() }).from(comments).where(visibleComments(articleId)),
      ]);

      return {
        // `sum()` of an `integer` column comes back as `bigint`, which node-postgres hands over
        // as a string to avoid a silent precision loss — `Number(...)` here rather than trusting
        // the column type.
        viewCount: Number(viewRows.rows[0]?.views ?? 0),
        likeCount: likeRows[0]?.value ?? 0,
        commentCount: commentRows[0]?.value ?? 0,
      };
    },

    async createComment(articleId, readerId, body) {
      const [inserted] = await db.insert(comments).values({ articleId, readerId, body }).returning({ id: comments.id });
      if (!inserted) throw new Error('comment insert returned no row');

      const [row] = await db
        .select(COMMENT_SELECT_COLUMNS)
        .from(comments)
        .innerJoin(readers, eq(readers.id, comments.readerId))
        .where(eq(comments.id, inserted.id))
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
