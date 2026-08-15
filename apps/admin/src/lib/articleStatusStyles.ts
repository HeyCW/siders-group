import type { ArticleStatus } from '@siders/contracts';

/** One status-color system, shared by the article list's row rule/chip and the editor's status
 *  chip, so "this color means this lifecycle state" holds across both surfaces. */
export const ARTICLE_STATUS_STYLES: Record<ArticleStatus, { rule: string; chip: string }> = {
  draft: { rule: 'bg-[var(--muted)]', chip: 'bg-[var(--muted-soft)] text-[var(--muted)]' },
  scheduled: { rule: 'bg-[var(--signal)]', chip: 'bg-[var(--signal-soft)] text-[var(--signal)]' },
  published: {
    rule: 'bg-[var(--status-published)]',
    chip: 'bg-[var(--status-published-soft)] text-[var(--status-published)]',
  },
};
