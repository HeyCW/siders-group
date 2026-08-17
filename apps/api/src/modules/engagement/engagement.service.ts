import type { ArticleEngagement, CommentResponse, LikeToggleResponse } from '@siders/contracts';
import { AppError } from '../../middleware/errorHandler.js';
import { toArticleEngagement, toCommentResponse } from './engagement.mapper.js';
import type { EngagementRepository } from './engagement.repository.js';

export interface EngagementService {
  recordView(articleId: string, visitorHash: string): Promise<void>;
  toggleLike(articleId: string, readerId: string): Promise<LikeToggleResponse>;
  getSummary(articleId: string, readerId: string | undefined): Promise<ArticleEngagement>;
  listComments(articleId: string, limit: number, offset: number): Promise<CommentResponse[]>;
  createComment(articleId: string, readerId: string, body: string): Promise<CommentResponse>;
}

/**
 * Not-found rather than forbidden, and identical for "no such article" and "article isn't public
 * yet". Answering 403 for the second would confirm that the id names something, which is exactly
 * the disclosure a caller enumerating uuids is after (specs/article-engagement/spec.md - "A draft
 * article is not found rather than forbidden").
 */
function articleNotFoundError(): AppError {
  return new AppError('Article not found', 404, 'not_found');
}

export function createEngagementService(repository: EngagementRepository): EngagementService {
  /**
   * Every operation gates on this first. Without it, a caller who guesses a uuid can inflate view
   * counts on a draft, or attach a comment to unpublished work that becomes visible the moment it
   * is published.
   */
  async function assertEngageable(articleId: string): Promise<void> {
    if (!(await repository.isArticleEngageable(articleId, new Date()))) {
      throw articleNotFoundError();
    }
  }

  return {
    async recordView(articleId, visitorHash) {
      await assertEngageable(articleId);
      await repository.recordView(articleId, visitorHash);
    },

    async toggleLike(articleId, readerId) {
      await assertEngageable(articleId);
      const liked = await repository.toggleLike(articleId, readerId);
      // Re-read rather than adjusting a count the caller sent us: the toggle and the count are
      // separate statements, so between them another reader may have liked or unliked. Returning
      // the freshly-read total is what lets the client replace its optimistic guess with a real
      // number instead of accumulating drift.
      const { likeCount } = await repository.getCounts(articleId);
      return { liked, likeCount };
    },

    async getSummary(articleId, readerId) {
      await assertEngageable(articleId);
      const [counts, likedByReader] = await Promise.all([
        repository.getCounts(articleId),
        // An anonymous caller is not an error here — they simply have no like to report
        // (specs/article-engagement/spec.md - "An anonymous caller receives counts").
        readerId === undefined ? Promise.resolve(false) : repository.hasLiked(articleId, readerId),
      ]);
      return toArticleEngagement(counts, likedByReader);
    },

    async listComments(articleId, limit, offset) {
      await assertEngageable(articleId);
      const rows = await repository.listComments(articleId, limit, offset);
      return rows.map(toCommentResponse);
    },

    async createComment(articleId, readerId, body) {
      await assertEngageable(articleId);
      const row = await repository.createComment(articleId, readerId, body);
      return toCommentResponse(row);
    },
  };
}
