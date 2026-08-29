import type {
  ArticleEngagement,
  CommentReportReason,
  CommentReportResponse,
  CommentResponse,
  LikeToggleResponse,
} from '@siders/contracts';
import { readerRequest } from './authApi';

/**
 * The article page's engagement calls, all through `authApi`'s one recovery cycle
 * (`readerRequest`). Two of them — the view POST and the two GETs — work perfectly well
 * anonymously; they go through the same wrapper anyway so that a *signed-in* caller's request
 * carries the CSRF header the API requires of it, without this module having to know which
 * callers are which.
 */

/** `POST /articles/:id/view` — 204, no body. */
export function recordArticleView(articleId: string): Promise<void> {
  return readerRequest<void>(`/articles/${encodeURIComponent(articleId)}/view`, { method: 'POST' });
}

export function getArticleEngagement(articleId: string): Promise<ArticleEngagement> {
  return readerRequest<ArticleEngagement>(`/articles/${encodeURIComponent(articleId)}/engagement`);
}

export function toggleArticleLike(articleId: string): Promise<LikeToggleResponse> {
  return readerRequest<LikeToggleResponse>(`/articles/${encodeURIComponent(articleId)}/like`, { method: 'POST' });
}

export function getArticleComments(
  articleId: string,
  params: { limit: number; offset: number },
): Promise<CommentResponse[]> {
  const qs = new URLSearchParams({ limit: String(params.limit), offset: String(params.offset) });
  return readerRequest<CommentResponse[]>(`/articles/${encodeURIComponent(articleId)}/comments?${qs.toString()}`);
}

export function postArticleComment(articleId: string, body: string): Promise<CommentResponse> {
  return readerRequest<CommentResponse>(`/articles/${encodeURIComponent(articleId)}/comments`, {
    method: 'POST',
    body: JSON.stringify({ body }),
  });
}

/**
 * `POST /comments/:id/report` — flags a comment for moderator review. Muted/banned readers may
 * still file a report (the API gates this route on `auth:reader` alone, no
 * `reader.can_author_content` check, mirroring that likes get the same exemption): reporting
 * abuse is not itself content creation.
 */
export function reportComment(
  commentId: string,
  reason: CommentReportReason,
  note?: string,
): Promise<CommentReportResponse> {
  return readerRequest<CommentReportResponse>(`/comments/${encodeURIComponent(commentId)}/report`, {
    method: 'POST',
    body: JSON.stringify(note ? { reason, note } : { reason }),
  });
}
