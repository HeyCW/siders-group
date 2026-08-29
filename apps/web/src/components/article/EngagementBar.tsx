import { formatCount } from '../../lib/formatCount';
import { useReaderSession } from '../../lib/readerSession';
import { CommentSection } from './CommentSection';
import { LikeButton } from './LikeButton';
import { SignInPrompt } from './SignInPrompt';
import { useArticleEngagement } from './useArticleEngagement';

/**
 * The strip's shared frame. Used by the loaded bar and by the skeleton alike, so the two occupy
 * the same height and the article content below never shifts when the counts arrive
 * (specs/web-public-site/spec.md - "The loading state reserves its own space").
 */
function BarFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-[clamp(20px,3vw,32px)] flex min-h-[58px] flex-wrap items-center gap-[clamp(12px,2vw,24px)] border-y-[3px] border-ink py-4">
      {children}
    </div>
  );
}

function Skeleton() {
  return (
    <BarFrame>
      <span className="h-[38px] w-[104px] animate-inkfade bg-rule" />
      <span className="h-3.5 w-24 animate-inkfade bg-rule" />
      <span className="h-3.5 w-20 animate-inkfade bg-rule" />
      <span className="sr-only" role="status">
        Memuat aktivitas artikel…
      </span>
    </BarFrame>
  );
}

/**
 * The article page's engagement island.
 *
 * `/news/[slug]` is ISR at 60 seconds — one cached HTML served to everyone — so none of this can
 * be rendered on the server without either showing a stale count or making the route dynamic
 * (`docs/ARCHITECTURE.md` §8.1, design.md - "The constraint everything else follows from"). The
 * server hands down only `articleId`, which the page already has for `RelatedArticles`.
 *
 * Three presentations, and the difference between them matters:
 *   - **loading**  → a skeleton at the loaded bar's dimensions.
 *   - **unavailable** → says so. Never zeroes, which would be a fabricated count
 *     (specs/web-public-site/spec.md - "A failed load is reported, not faked").
 *   - **ready** → real numbers, and either the like control or a sign-in prompt in its place.
 */
export function EngagementBar({ articleId }: { articleId: string }) {
  const { session } = useReaderSession();
  const readerId = session.status === 'authenticated' ? session.account.id : null;
  const { state, likePending, loadingMoreComments, toggleLike, submitComment, loadMoreComments } =
    useArticleEngagement(articleId, readerId);

  if (state.status === 'loading') return <Skeleton />;

  if (state.status === 'unavailable') {
    return (
      <BarFrame>
        <span role="status" className="font-sans text-[11px] font-bold uppercase tracking-widest text-muted">
          Aktivitas artikel sedang tidak tersedia.
        </span>
      </BarFrame>
    );
  }

  const { summary, comments, hasMoreComments } = state;

  return (
    <>
      <BarFrame>
        {/* Nothing in this slot while the session resolves. An anonymous-looking prompt shown to
            what turns out to be a signed-in reader is worse than a brief gap — the same call
            `ReaderControl` makes in the masthead (specs/web-public-site/spec.md - "Neither
            control is shown before the session is known"). */}
        {session.status === 'anonymous' && <SignInPrompt action="untuk menyukai artikel ini." />}
        {session.status === 'authenticated' && (
          <LikeButton
            liked={summary.likedByReader}
            count={summary.likeCount}
            pending={likePending}
            onToggle={() => void toggleLike()}
          />
        )}

        <span className="font-sans text-[11px] font-bold uppercase tracking-widest text-muted tabular-nums">
          {formatCount(summary.viewCount)} kali dibaca
        </span>
        <span className="font-sans text-[11px] font-bold uppercase tracking-widest text-muted tabular-nums">
          {formatCount(summary.commentCount)} komentar
        </span>
      </BarFrame>

      <CommentSection
        comments={comments}
        commentCount={summary.commentCount}
        hasMore={hasMoreComments}
        loadingMore={loadingMoreComments}
        onLoadMore={() => void loadMoreComments()}
        onSubmit={submitComment}
      />
    </>
  );
}
