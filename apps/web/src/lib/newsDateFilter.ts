export type NewsDateOption = '7d' | '30d' | 'year' | 'custom';

export const NEWS_DATE_OPTIONS: { value: NewsDateOption; label: string }[] = [
  { value: '7d', label: '7 hari terakhir' },
  { value: '30d', label: '30 hari terakhir' },
  { value: 'year', label: 'Tahun ini' },
  { value: 'custom', label: 'Rentang khusus' },
];

export function isNewsDateOption(value: string | undefined): value is NewsDateOption {
  return NEWS_DATE_OPTIONS.some((option) => option.value === value);
}

export interface ResolvedNewsDateRange {
  publishedAfter?: string;
  publishedBefore?: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Resolves the News page's selected Tanggal option into concrete `publishedAfter`/
 * `publishedBefore` bounds at request time, rather than persisting the resolved instant in the
 * URL — so a `?date=7d` link keeps meaning "the last 7 days" as "today" moves
 * (design.md - "Date range: two independent optional bounds, resolved client-side").
 */
export function resolveNewsDateRange(
  option: NewsDateOption | undefined,
  dateFrom: string | undefined,
  dateTo: string | undefined,
  now: Date,
): ResolvedNewsDateRange {
  if (option === '7d') return { publishedAfter: new Date(now.getTime() - 7 * DAY_MS).toISOString() };
  if (option === '30d') return { publishedAfter: new Date(now.getTime() - 30 * DAY_MS).toISOString() };
  if (option === 'year') {
    return { publishedAfter: new Date(Date.UTC(now.getUTCFullYear(), 0, 1)).toISOString() };
  }
  if (option === 'custom') {
    const result: ResolvedNewsDateRange = {};
    if (dateFrom) result.publishedAfter = new Date(`${dateFrom}T00:00:00.000Z`).toISOString();
    if (dateTo) result.publishedBefore = new Date(`${dateTo}T23:59:59.999Z`).toISOString();
    return result;
  }
  return {};
}
