'use client';

/**
 * The like control itself — presentation only. Whether it renders at all, and whether a
 * `SignInPrompt` stands in its place, is decided by `EngagementBar` from the reader session, so
 * this component never has to know about sessions.
 *
 * `aria-pressed` rather than a label that flips between "Like" and "Unlike": the button is a
 * toggle, and a screen reader announces its state from the attribute without the visible label
 * having to change under the reader's cursor mid-press.
 */
export function LikeButton({
  liked,
  count,
  pending,
  onToggle,
}: {
  liked: boolean;
  count: number;
  pending: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={pending}
      aria-pressed={liked}
      className={`inline-flex items-center gap-2 border-2 px-3 py-2 font-sans text-[11px] font-bold uppercase tracking-widest transition-colors duration-hover ease-hover disabled:opacity-60 ${
        liked
          ? 'border-ink bg-ink text-paper hover:bg-transparent hover:text-ink focus-visible:bg-transparent focus-visible:text-ink'
          : 'border-ink bg-transparent text-ink hover:bg-ink hover:text-paper focus-visible:bg-ink focus-visible:text-paper'
      }`}
    >
      <span aria-hidden="true">{liked ? '★' : '☆'}</span>
      Like
      <span className="font-serif text-sm font-bold normal-case tracking-normal tabular-nums">{count}</span>
    </button>
  );
}
