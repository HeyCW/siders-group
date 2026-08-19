/**
 * Client-side gate in front of `POST /articles/:id/view`, keyed by article and the device's
 * calendar day. Sits in front of the server's own IP-based dedup (`view_seen` /
 * `article_views_daily.unique_views` in `engagement.repository.ts`) rather than replacing it —
 * this only stops the *same device* from resending the request it already sent today (a refresh,
 * a StrictMode double-mount, a client-side nav back to the same article), so the public `views`
 * counter reads closer to "devices per article per day" without touching what the server counts
 * or how.
 */

const KEY_PREFIX = 'viewed';

/**
 * Article/day pairs currently mid-request in this tab, each mapped to the in-flight attempt
 * itself rather than a bare flag. Closes two gaps `localStorage` alone can't:
 *
 * 1. The persisted flag is only written after the POST resolves, but React's development
 *    StrictMode double-invokes the mount effect synchronously (mount → cleanup → remount) before
 *    that first `await` ever settles, so both invocations would otherwise see "not recorded yet"
 *    and both send the request.
 * 2. A second invocation that merely skips the request (rather than joining the first) would race
 *    ahead to read the engagement summary before the first invocation's POST has actually landed —
 *    and since StrictMode's *first* invocation is the one that gets torn down, its result is
 *    discarded and the second invocation's (stale, view-not-yet-counted) summary is what renders.
 *    Sharing the promise means every invocation waits for the same attempt to settle before either
 *    one reads counts.
 *
 * Module-scoped rather than per-hook-instance so it survives the unmount-then-immediately-remount
 * pair StrictMode performs, and so a client-side navigation away and back within the same tab
 * session shares it too.
 */
const inFlight = new Map<string, Promise<void>>();

function todayKey(articleId: string): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${articleId}:${year}-${month}-${day}`;
}

function storageKey(dayScopedKey: string): string {
  return `${KEY_PREFIX}:${dayScopedKey}`;
}

/**
 * Whether this device has already recorded a view for this article today. `false` during SSR
 * (there is no `localStorage` to check) and `false` if storage throws (blocked, full, or a
 * privacy mode that rejects writes) — either way the safe default is to let the request through
 * rather than silently drop a real view.
 */
export function hasRecordedViewToday(articleId: string): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(storageKey(todayKey(articleId))) !== null;
  } catch {
    return false;
  }
}

/** Marks today's view as recorded for this article. A no-op during SSR or when storage throws —
 *  the view still counted server-side; only this device's memory of it is lost. */
export function markViewRecorded(articleId: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(storageKey(todayKey(articleId)), '1');
  } catch {
    // Nothing to recover: worst case is a retried POST next load, same as storage being empty.
  }
}

/**
 * Ensures a view is recorded for this article today, in this tab, exactly once — and resolves
 * only once that single attempt has settled, whichever caller started it. A caller whose check
 * finds nothing recorded and nothing in flight starts `send` and stores the resulting promise; any
 * concurrent caller (StrictMode's second mount, in particular) finds that stored promise and awaits
 * it instead of starting a second request or reading counts early. `send` is called at most once
 * per article/day per tab; a rejection leaves the view unmarked so a later, non-concurrent call
 * retries it.
 */
export function ensureViewRecorded(articleId: string, send: () => Promise<void>): Promise<void> {
  if (hasRecordedViewToday(articleId)) return Promise.resolve();

  const key = todayKey(articleId);
  const existing = inFlight.get(key);
  if (existing) return existing;

  const attempt = send()
    .then(() => markViewRecorded(articleId))
    .catch(() => undefined)
    .finally(() => inFlight.delete(key));
  inFlight.set(key, attempt);
  return attempt;
}
