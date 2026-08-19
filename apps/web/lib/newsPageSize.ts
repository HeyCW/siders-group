/**
 * Shared between the server page (`app/news/page.tsx`, the initial fetch) and `NewsExplorer`
 * (load-more), so the two never drift apart — `hasMore` compares a fetched page's length against
 * this same number in both places.
 *
 * 9 rather than a rounder number: with no category filter and no search query, the first article
 * becomes the featured card and the rest fill the grid, which fits 4 per row at typical desktop
 * widths (`grid-cols-[repeat(auto-fit,minmax(260px,1fr))]`) — so 1 featured + 8 grid is two full
 * rows before "Load more" appears, instead of a half-empty second row.
 */
export const NEWS_PAGE_SIZE = 9;
