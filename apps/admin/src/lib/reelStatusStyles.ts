import type { ReelStatus } from '@siders/contracts';

/** Mirrors articleStatusStyles.ts's rule/chip pairing so a reel's lifecycle state reads the same
 *  way as an article's, across the library list and the curation rail. `unavailable` reuses the
 *  amber "needs attention" language already used for the curation pages' "not live" badges. */
export const REEL_STATUS_STYLES: Record<ReelStatus, { rule: string; chip: string }> = {
  draft: { rule: 'bg-[var(--muted)]', chip: 'bg-[var(--muted-soft)] text-[var(--muted)]' },
  published: {
    rule: 'bg-[var(--status-published)]',
    chip: 'bg-[var(--status-published-soft)] text-[var(--status-published)]',
  },
  unavailable: { rule: 'bg-amber-500', chip: 'bg-amber-500/15 text-amber-700 dark:text-amber-400' },
};
