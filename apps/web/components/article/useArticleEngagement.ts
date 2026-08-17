'use client';

import { useCallback, useEffect, useState } from 'react';
import { COMMENT_PAGE_SIZE, type ArticleEngagement, type CommentResponse } from '@siders/contracts';
import {
  getArticleComments,
  getArticleEngagement,
  postArticleComment,
  recordArticleView,
  toggleArticleLike,
} from '../../lib/engagementApi';

export interface EngagementReady {
  status: 'ready';
  summary: ArticleEngagement;
  comments: CommentResponse[];
  hasMoreComments: boolean;
}

export type EngagementState = { status: 'loading' } | EngagementReady | { status: 'unavailable' };

export interface UseArticleEngagement {
  state: EngagementState;
  likePending: boolean;
  loadingMoreComments: boolean;
  toggleLike: () => Promise<void>;
  /** Rejects on failure so the composer can keep the reader's text and show the reason. */
  submitComment: (body: string) => Promise<void>;
  loadMoreComments: () => Promise<void>;
}

/**
 * The article page's engagement island, in one hook.
 *
 * The mount sequence records the view *before* reading the counts rather than firing all three
 * together. Fired in parallel, the visitor's own view is never in the number they are shown — the
 * count only catches up on their next visit, which reads as a broken counter. The cost is one
 * extra round trip, paid inside a skeleton the reader is already looking at (design.md — "Request
 * order on mount").
 *
 * A failing view POST — including a 429 from its own hourly budget — is swallowed: the counts
 * still load, one short (specs/article-engagement/spec.md — "Recording a view never blocks the
 * reader").
 *
 * `readerId` is `null` until `ReaderSessionProvider` resolves, then either a reader id or `null`
 * again for good. The mount load above always fires anonymously — its `GET /engagement` races
 * `ReaderSessionProvider`'s own session check and typically loses it, so `likedByReader` it
 * receives cannot be trusted once the session turns out to be authenticated. This is not merely
 * cosmetic: on a page load with no live access-token cookie (the ordinary case for a reader
 * returning after the 15-minute access-cookie lifetime — see `apps/api/src/lib/cookies.ts`),
 * `GET /engagement` succeeds anonymously with `likedByReader: false` before the session's own
 * 401 → refresh cycle has completed, and `LikeButton` would render un-pressed on an article the
 * reader has already liked — so pressing it *removes* the like. Once `readerId` is known, this
 * re-reads the summary with the now-authenticated request so `likedByReader` reflects reality.
 */
export function useArticleEngagement(articleId: string, readerId: string | null): UseArticleEngagement {
  const [state, setState] = useState<EngagementState>({ status: 'loading' });
  const [likePending, setLikePending] = useState(false);
  const [loadingMoreComments, setLoadingMoreComments] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load(): Promise<void> {
      // React's development StrictMode mounts effects twice, so this fires twice in `next dev`
      // and once in a production build. Uniques are unaffected — the server deduplicates per
      // visitor per day — so the only consequence is an inflated total in local development.
      await recordArticleView(articleId).catch(() => undefined);

      try {
        const [summary, comments] = await Promise.all([
          getArticleEngagement(articleId),
          getArticleComments(articleId, { limit: COMMENT_PAGE_SIZE, offset: 0 }),
        ]);
        if (cancelled) return;
        setState({
          status: 'ready',
          summary,
          comments,
          // A full page is the only signal the listing gives that more may exist — it returns a
          // bare array, matching `/articles` and `NewsExplorer`'s own load-more.
          hasMoreComments: comments.length === COMMENT_PAGE_SIZE,
        });
      } catch {
        if (!cancelled) setState({ status: 'unavailable' });
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [articleId]);

  // Re-reads the summary once the reader session is known to be authenticated, so
  // `likedByReader` reflects a request that actually carried the session — see the note above.
  useEffect(() => {
    if (readerId === null) return;
    let cancelled = false;

    getArticleEngagement(articleId)
      .then((summary) => {
        if (cancelled) return;
        setState((current) => (current.status === 'ready' ? { ...current, summary } : current));
      })
      // The mount load above already owns reporting `unavailable`; a failure here just leaves
      // the anonymous summary in place rather than surfacing a second error path.
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [articleId, readerId]);

  const toggleLike = useCallback(async (): Promise<void> => {
    if (likePending) return;
    setLikePending(true);

    // Optimistic, so the button responds to the press rather than to the network. Only the two
    // like fields are touched on the way out and on rollback — restoring the whole summary would
    // also revert a comment count that a concurrent submission had legitimately raised.
    setState((current) =>
      current.status === 'ready'
        ? {
            ...current,
            summary: {
              ...current.summary,
              likedByReader: !current.summary.likedByReader,
              likeCount: current.summary.likeCount + (current.summary.likedByReader ? -1 : 1),
            },
          }
        : current,
    );

    try {
      const result = await toggleArticleLike(articleId);
      // The server's count, not the optimistic one: another reader may have liked or unliked
      // between the toggle and this response, and accepting the guess would accumulate drift.
      setState((current) =>
        current.status === 'ready'
          ? {
              ...current,
              summary: { ...current.summary, likedByReader: result.liked, likeCount: result.likeCount },
            }
          : current,
      );
    } catch {
      setState((current) =>
        current.status === 'ready'
          ? {
              ...current,
              summary: {
                ...current.summary,
                likedByReader: !current.summary.likedByReader,
                likeCount: current.summary.likeCount + (current.summary.likedByReader ? -1 : 1),
              },
            }
          : current,
      );
    } finally {
      setLikePending(false);
    }
  }, [articleId, likePending]);

  const submitComment = useCallback(
    async (body: string): Promise<void> => {
      // Deliberately not optimistic: the server assigns the id and timestamp, and a rejected
      // comment must leave the reader's text where they can fix it rather than removing a row
      // they just watched appear (specs/web-public-site/spec.md — "A rejected comment keeps the
      // reader's text"). The throw propagates to the composer.
      const comment = await postArticleComment(articleId, body);
      setState((current) =>
        current.status === 'ready'
          ? {
              ...current,
              comments: [comment, ...current.comments],
              summary: { ...current.summary, commentCount: current.summary.commentCount + 1 },
            }
          : current,
      );
    },
    [articleId],
  );

  const loadMoreComments = useCallback(async (): Promise<void> => {
    if (state.status !== 'ready' || loadingMoreComments) return;
    setLoadingMoreComments(true);
    try {
      const next = await getArticleComments(articleId, {
        limit: COMMENT_PAGE_SIZE,
        offset: state.comments.length,
      });
      setState((current) =>
        current.status === 'ready'
          ? { ...current, comments: [...current.comments, ...next], hasMoreComments: next.length === COMMENT_PAGE_SIZE }
          : current,
      );
    } catch {
      // The already-loaded comments stay on screen; the reader can press again.
    } finally {
      setLoadingMoreComments(false);
    }
  }, [articleId, state, loadingMoreComments]);

  return { state, likePending, loadingMoreComments, toggleLike, submitComment, loadMoreComments };
}
