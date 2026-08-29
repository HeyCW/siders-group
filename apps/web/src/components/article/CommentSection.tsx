import { useState, type FormEvent } from 'react';
import { COMMENT_MAX_LENGTH, type CommentResponse } from '@siders/contracts';
import { ApiError } from '../../lib/authApi';
import { formatCount } from '../../lib/formatCount';
import { useReaderSession } from '../../lib/readerSession';
import { SignInPrompt } from './SignInPrompt';

function formatCommentDate(iso: string): string {
  return new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * The API answers a rejected comment with a `code` on the error envelope. Branching on that code
 * rather than on the message, per `docs/ARCHITECTURE.md` §9.2 — "Clients branch on `code`, never
 * on `message`. Messages are for humans and will be rewritten."
 */
function rejectionMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === 'reader_muted') return 'Akunmu sedang dibisukan, jadi komentar belum bisa dikirim.';
    if (error.code === 'rate_limited') return 'Terlalu banyak komentar dalam satu jam. Coba lagi nanti.';
    if (error.code === 'validation_error') return 'Komentar tidak boleh kosong.';
    if (error.status === 401) return 'Sesi kamu sudah berakhir. Masuk lagi untuk berkomentar.';
  }
  return 'Komentar gagal dikirim. Coba lagi.';
}

function CommentComposer({ onSubmit }: { onSubmit: (body: string) => Promise<void> }) {
  const [body, setBody] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (submitting || body.trim() === '') return;
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit(body.trim());
      // Cleared only after the server accepted it. On rejection the text stays exactly where the
      // reader left it (specs/web-public-site/spec.md - "A rejected comment keeps the reader's
      // text").
      setBody('');
    } catch (err) {
      setError(rejectionMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="border-b border-rule py-[clamp(14px,2vw,20px)]">
      <label htmlFor="comment-body" className="sr-only">
        Tulis komentar
      </label>
      <textarea
        id="comment-body"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        maxLength={COMMENT_MAX_LENGTH}
        rows={3}
        placeholder="Tulis komentar…"
        className="w-full resize-y border-0 border-b-2 border-ink bg-transparent py-2 text-[15px] leading-[1.6] outline-none placeholder:text-muted"
      />
      <div className="mt-2.5 flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={submitting || body.trim() === ''}
          className="bg-ink px-[18px] py-2.5 font-sans text-[11px] font-bold uppercase tracking-widest text-paper transition-opacity duration-hover ease-hover disabled:opacity-40"
        >
          {submitting ? 'Mengirim…' : 'Kirim'}
        </button>
        <span className="font-sans text-[11px] font-bold uppercase tracking-widest text-muted tabular-nums">
          {body.trim().length}/{COMMENT_MAX_LENGTH}
        </span>
        {/* Signal yellow as a background behind ink, never as text on paper — #FFD100 on #F7F6F2
            is unreadable, and a highlight block is the design's own idiom for the accent. */}
        {error && (
          <span
            role="alert"
            className="bg-signal px-2 py-1 font-sans text-[11px] font-bold uppercase tracking-widest text-ink"
          >
            {error}
          </span>
        )}
      </div>
    </form>
  );
}

/**
 * Flat, newest first, with no reply affordance anywhere — comments carry no parent in the data
 * model, so offering one here would be an interface for something that cannot exist
 * (specs/web-public-site/spec.md - "The comment list is flat and newest-first, with no reply
 * affordance").
 *
 * Bodies are rendered as text children, never `dangerouslySetInnerHTML`. That is the whole
 * defense against markup in a reader-authored body, and it is why the API stores comments as
 * plain text rather than passing them through `sanitizeHtml`.
 */
export function CommentSection({
  comments,
  commentCount,
  hasMore,
  loadingMore,
  onLoadMore,
  onSubmit,
}: {
  comments: CommentResponse[];
  commentCount: number;
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
  onSubmit: (body: string) => Promise<void>;
}) {
  const { session } = useReaderSession();

  return (
    <section className="pt-[clamp(20px,3vw,32px)]">
      <div className="flex items-baseline justify-between gap-4 border-b-[3px] border-ink pb-2">
        <h2 className="font-serif text-[clamp(20px,2.6vw,28px)] font-bold uppercase tracking-[0.02em]">Komentar</h2>
        <span className="font-sans text-[11px] font-bold uppercase tracking-widest text-muted tabular-nums">
          {formatCount(commentCount)}
        </span>
      </div>

      {/* Nothing while the session is still resolving — an anonymous-looking prompt shown to what
          turns out to be a signed-in reader is worse than a brief blank, the same call
          `ReaderControl` makes for the masthead. */}
      {session.status === 'anonymous' && (
        <div className="border-b border-rule py-[clamp(14px,2vw,20px)]">
          <SignInPrompt action="untuk ikut berkomentar." />
        </div>
      )}
      {session.status === 'authenticated' && <CommentComposer onSubmit={onSubmit} />}

      {comments.length === 0 ? (
        <p className="py-[clamp(20px,3vw,32px)] font-sans text-[11px] font-bold uppercase tracking-widest text-muted">
          Belum ada komentar.
        </p>
      ) : (
        <ul>
          {comments.map((comment) => (
            <li key={comment.id} className="border-b border-rule py-[clamp(14px,2vw,20px)]">
              <div className="flex items-center gap-2.5">
                {comment.authorAvatarUrl ? (
                  <img
                    src={comment.authorAvatarUrl}
                    alt=""
                    className="h-6 w-6 rounded-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-ink text-[11px] font-bold text-paper">
                    {comment.authorName.charAt(0).toUpperCase()}
                  </span>
                )}
                <span className="font-sans text-[11px] font-bold uppercase tracking-widest">{comment.authorName}</span>
                <time
                  dateTime={comment.createdAt}
                  className="font-sans text-[11px] font-bold uppercase tracking-widest text-muted"
                >
                  {formatCommentDate(comment.createdAt)}
                </time>
              </div>
              <p className="mt-2 max-w-[66ch] whitespace-pre-wrap text-[15px] leading-[1.6]">{comment.body}</p>
            </li>
          ))}
        </ul>
      )}

      {hasMore && (
        <div className="flex justify-center py-[clamp(20px,3vw,32px)]">
          <button
            type="button"
            onClick={onLoadMore}
            disabled={loadingMore}
            className="border-2 border-ink px-7 py-3 font-sans text-[11px] font-bold uppercase tracking-widest transition-colors duration-hover ease-hover hover:bg-ink hover:text-paper focus-visible:bg-ink focus-visible:text-paper disabled:opacity-50"
          >
            {loadingMore ? 'Memuat…' : 'Komentar lama'}
          </button>
        </div>
      )}
    </section>
  );
}
