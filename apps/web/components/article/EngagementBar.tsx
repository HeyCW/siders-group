/**
 * No comments table, no likes table, no rate-limit bucket implemented anywhere in this codebase
 * despite being named in `docs/ARCHITECTURE.md` §8.1/§9.1/§9.3 — this renders the design's exact
 * visual structure with no fabricated counts and no working submission
 * (`add-web-news-pages/proposal.md` — Non-Goals: "Comments, likes, and share counts").
 */
export function EngagementBar() {
  return (
    <div className="mt-[clamp(20px,3vw,32px)] flex flex-wrap items-center gap-[clamp(12px,2vw,24px)] border-y-[3px] border-ink py-4">
      <button
        type="button"
        disabled
        title="Liking isn't open yet"
        className="inline-flex items-center gap-2 bg-transparent px-2.5 py-2 font-sans text-[11px] font-bold uppercase tracking-widest text-muted disabled:cursor-not-allowed"
      >
        Like
      </button>
      <span className="font-sans text-[11px] font-bold uppercase tracking-widest text-muted">
        No comments yet
      </span>
      <input
        type="text"
        disabled
        placeholder="Comments aren't open yet"
        title="Comments aren't open yet"
        className="min-w-[180px] flex-1 basis-[220px] border-0 border-b-2 border-rule-strong bg-transparent py-2 text-sm text-muted outline-none placeholder:text-muted"
      />
    </div>
  );
}
