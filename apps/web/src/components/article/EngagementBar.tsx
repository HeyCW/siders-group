import { useReaderSession } from '../../lib/readerSession';
// Disabled for now — the login-gated features, and the views counter alongside them.
// import { formatCount } from '../../lib/formatCount';
// import { CommentSection } from './CommentSection';
// import { LikeButton } from './LikeButton';
// import { SignInPrompt } from './SignInPrompt';
import { useArticleEngagement } from './useArticleEngagement';

/**
 * The article page's engagement island — currently an island with nothing on it.
 *
 * `/news/[slug]` is ISR at 60 seconds — one cached HTML served to everyone — so none of this can
 * be rendered on the server without either showing a stale count or making the route dynamic
 * (`docs/ARCHITECTURE.md` §8.1, design.md - "The constraint everything else follows from"). The
 * server hands down only `articleId`, which the page already has for `RelatedArticles`.
 *
 * The like control and comment section were disabled first; the views counter followed, which
 * left the strip with nothing to show. So it renders `null` rather than an empty bordered frame,
 * and `BarFrame`/`Skeleton` and the loading/unavailable presentations went with it — restore them
 * from this file's history if any of the three counts comes back.
 *
 * What it still does: `useArticleEngagement` runs on mount, and that hook is what records the
 * view (→ `ensureViewRecorded` → `POST /articles/:id/view`). Recording is deliberately kept while
 * the display is gone, because the admin dashboard's readership figures are built from it.
 */
export function EngagementBar({ articleId }: { articleId: string }) {
  const { session } = useReaderSession();
  const readerId = session.status === 'authenticated' ? session.account.id : null;
  // Called for its mount effect alone — every value it returns (state, likePending, toggleLike,
  // comment paging, submitComment) belongs to a disabled presentation.
  useArticleEngagement(articleId, readerId);

  return null;
}
