import { useState } from 'react';
import { COMMENT_REPORT_REASONS, type CommentReportReason } from '@siders/contracts';
import { ApiError } from '../../lib/authApi';
import { reportComment } from '../../lib/engagementApi';

const REASON_LABELS: Record<CommentReportReason, string> = {
  spam: 'Spam',
  harassment: 'Pelecehan',
  off_topic: 'Di luar topik',
  other: 'Lainnya',
};

function reportErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.code === 'rate_limited') {
    return 'Terlalu banyak laporan. Coba lagi nanti.';
  }
  return 'Laporan gagal dikirim. Coba lagi.';
}

/**
 * One comment's report affordance — an inline reason picker rather than a separate dialog,
 * matching the composer's own inline-form idiom elsewhere on this page. Reporting is fire-once
 * feedback to moderators, not a toggle: once filed — or once the API says it was already filed in
 * an earlier session, which reads the same as success here — the control settles into a
 * confirmation for the rest of this page view. Rendered only for a signed-in reader; a
 * muted/banned reader may still use it, since flagging abuse is not itself content creation
 * (mirrors the API's own `auth:reader`-only gate on this route).
 */
export function CommentReportControl({ commentId }: { commentId: string }) {
  const [open, setOpen] = useState(false);
  const [pendingReason, setPendingReason] = useState<CommentReportReason | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (done) {
    return <span className="font-sans text-[11px] font-bold uppercase tracking-widest text-muted">Dilaporkan</span>;
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="font-sans text-[11px] font-bold uppercase tracking-widest text-muted underline-offset-2 transition-colors duration-hover ease-hover hover:text-ink hover:underline"
      >
        Laporkan
      </button>
    );
  }

  async function submit(reason: CommentReportReason): Promise<void> {
    setPendingReason(reason);
    setErrorMessage(null);
    try {
      await reportComment(commentId, reason);
      setDone(true);
    } catch (err) {
      // Already reported — in an earlier session, or a race with another tab — reads the same as
      // success: the reader's goal ("flag this") is already satisfied either way.
      if (err instanceof ApiError && err.code === 'already_reported') {
        setDone(true);
        return;
      }
      setErrorMessage(reportErrorMessage(err));
      setPendingReason(null);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="font-sans text-[11px] font-bold uppercase tracking-widest text-muted">Laporkan sebagai:</span>
      {COMMENT_REPORT_REASONS.map((reason) => (
        <button
          key={reason}
          type="button"
          disabled={pendingReason !== null}
          onClick={() => void submit(reason)}
          className="border border-ink px-2 py-1 font-sans text-[11px] font-bold uppercase tracking-widest transition-colors duration-hover ease-hover hover:bg-ink hover:text-paper disabled:opacity-50"
        >
          {pendingReason === reason ? 'Mengirim…' : REASON_LABELS[reason]}
        </button>
      ))}
      <button
        type="button"
        onClick={() => setOpen(false)}
        disabled={pendingReason !== null}
        className="font-sans text-[11px] font-bold uppercase tracking-widest text-muted transition-colors duration-hover ease-hover hover:text-ink disabled:opacity-50"
      >
        Batal
      </button>
      {errorMessage && (
        <span
          role="alert"
          className="bg-signal px-2 py-1 font-sans text-[11px] font-bold uppercase tracking-widest text-ink"
        >
          {errorMessage}
        </span>
      )}
    </div>
  );
}
