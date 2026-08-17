import { useEffect, useState } from 'react';
import type { DashboardCadenceBucket, DashboardResponse } from '@siders/contracts';
import { ApiError } from '../lib/api.js';
import { dashboardApi } from '../lib/dashboardApi.js';

function Tile({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-[var(--rule)] p-4">
      <h2 className="mb-3 font-mono text-[10px] uppercase tracking-widest text-[var(--muted)]">{title}</h2>
      {children}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="font-display text-2xl">{value}</p>
      <p className="font-mono text-xs text-[var(--muted)]">{label}</p>
    </div>
  );
}

/**
 * Inline CSS bars, not a charting library — the tile renders exactly 8 fixed data points and
 * `/dashboard` is the non-lazy landing route, so no bundle-weight dependency is warranted
 * (tasks.md - 4.2; CLAUDE.md - "lazy-load large features").
 */
function CadenceChart({ buckets }: { buckets: DashboardCadenceBucket[] }) {
  const allZero = buckets.every((bucket) => bucket.count === 0);
  if (allZero) {
    return <p className="text-sm text-[var(--muted)]">No articles published in this window yet.</p>;
  }

  const max = Math.max(...buckets.map((bucket) => bucket.count), 1);
  return (
    <div className="flex items-end gap-2" style={{ height: '96px' }}>
      {buckets.map((bucket, index) => {
        const isCurrentWeek = index === buckets.length - 1;
        return (
          <div key={bucket.weekStart} className="flex flex-1 flex-col items-center gap-1">
            <div className="flex h-full w-full items-end">
              <div
                className={`w-full rounded-t ${isCurrentWeek ? 'bg-[var(--signal)]/40' : 'bg-[var(--signal)]'}`}
                style={{ height: `${(bucket.count / max) * 100}%`, minHeight: bucket.count > 0 ? '2px' : '0' }}
                title={`${bucket.weekStart}: ${bucket.count}${isCurrentWeek ? ' (partial week)' : ''}`}
              />
            </div>
            <span className="font-mono text-[10px] text-[var(--muted)]">{bucket.weekStart.slice(5)}</span>
          </div>
        );
      })}
    </div>
  );
}

/** Pinned to Asia/Jakarta, matching every other time-bearing value on this board — the caller's
 *  local timezone would otherwise silently disagree with the Jakarta-bucketed cadence tile. */
function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'Asia/Jakarta',
  });
}

/**
 * The admin dashboard: seven read-only tiles computed entirely from existing data
 * (specs/admin-dashboard/spec.md). No click-throughs and no filters — every tile shows counts
 * (or, for "Up next" and "Readership", the rows that are their entire point) with no way to
 * drill in further.
 */
export function DashboardPage() {
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    dashboardApi
      .get()
      .then(setData)
      .catch((err: unknown) => {
        if (err instanceof ApiError && err.status === 403) {
          setForbidden(true);
        } else {
          setError(err instanceof ApiError ? err.message : 'Could not load the dashboard');
        }
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="siders-scope min-h-full bg-[var(--paper)] text-[var(--ink)]">
        <div className="mx-auto max-w-5xl p-6">
          <p className="font-mono text-sm text-[var(--muted)]">Loading…</p>
        </div>
      </div>
    );
  }

  // `/` redirects here unconditionally regardless of the caller's permissions (design.md -
  // "Landing page moves" - "Known gap, explicitly out of scope"), so a staff member without
  // `dashboard.view` lands here and hits this state on every login until admin route guarding
  // exists. This message is the mitigation this change is scoped to provide.
  if (forbidden) {
    return (
      <div className="siders-scope min-h-full bg-[var(--paper)] text-[var(--ink)]">
        <div className="mx-auto max-w-5xl p-6">
          <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300">
            You don&apos;t have permission to view the dashboard.
          </p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="siders-scope min-h-full bg-[var(--paper)] text-[var(--ink)]">
        <div className="mx-auto max-w-5xl p-6">
          <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300">
            {error ?? 'Could not load the dashboard'}
          </p>
        </div>
      </div>
    );
  }

  const readersHasHistory = data.readers.newLast7d > 0 || data.readers.activeLast30d > 0;
  // The top-articles list is checked too: its window is 30 days against the totals' 7, so an
  // article read a fortnight ago and not since would otherwise render the tile as "no reads yet"
  // while the list beneath it had rows.
  const readershipHasHistory =
    data.readership.last7dViews > 0 ||
    data.readership.last7dUniqueViews > 0 ||
    data.readership.topArticles.length > 0;

  return (
    <div className="siders-scope min-h-full bg-[var(--paper)] text-[var(--ink)]">
      <div className="mx-auto max-w-5xl p-6">
        <div className="mb-6">
          <p className="font-mono text-xs uppercase tracking-widest text-[var(--muted)]">Newsroom overview</p>
          <h1 className="font-display text-3xl">Dashboard</h1>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Tile title="Pipeline">
            <div className="flex gap-6">
              <Stat label="Draft" value={data.pipeline.draft} />
              <Stat label="Scheduled" value={data.pipeline.scheduled} />
              <Stat label="Published" value={data.pipeline.published} />
            </div>
          </Tile>

          <Tile title="Publishing cadence (last 8 weeks)">
            <CadenceChart buckets={data.cadence} />
          </Tile>

          <Tile title="Content debt">
            <ul className="space-y-1 text-sm text-[var(--ink)]">
              <li className="flex justify-between">
                <span>Missing SEO description</span>
                <span className="font-mono text-[var(--muted)]">{data.contentDebt.missingSeoDescription}</span>
              </li>
              <li className="flex justify-between">
                <span>Missing excerpt</span>
                <span className="font-mono text-[var(--muted)]">{data.contentDebt.missingExcerpt}</span>
              </li>
              <li className="flex justify-between">
                <span>Missing featured image</span>
                <span className="font-mono text-[var(--muted)]">{data.contentDebt.missingFeaturedImage}</span>
              </li>
              <li className="flex justify-between">
                <span>Uncategorized</span>
                <span className="font-mono text-[var(--muted)]">{data.contentDebt.uncategorized}</span>
              </li>
              <li className="flex justify-between">
                <span>Unused tags</span>
                <span className="font-mono text-[var(--muted)]">{data.contentDebt.unusedTags}</span>
              </li>
            </ul>
          </Tile>

          <Tile title="Homepage & reels integrity">
            <div className="flex gap-6">
              <div>
                <p className="font-display text-2xl">
                  {data.curationIntegrity.home.visible} / {data.curationIntegrity.home.total}
                </p>
                <p className="font-mono text-xs text-[var(--muted)]">Homepage curation visible</p>
              </div>
              <div>
                <p className="font-display text-2xl">
                  {data.curationIntegrity.reels.visible} / {data.curationIntegrity.reels.total}
                </p>
                <p className="font-mono text-xs text-[var(--muted)]">Reels curation visible</p>
              </div>
            </div>
          </Tile>

          <Tile title="Up next (times in WIB)">
            {data.upNext.overdueUnpromotedCount > 0 && (
              <p className="mb-3 rounded-md bg-amber-500/15 px-3 py-2 text-sm text-amber-700 dark:text-amber-400">
                {data.upNext.overdueUnpromotedCount} scheduled article
                {data.upNext.overdueUnpromotedCount === 1 ? ' is' : 's are'} past due — check the publish worker.
              </p>
            )}
            {data.upNext.dueWithin48h.length === 0 && (
              <p className="text-sm text-[var(--muted)]">Nothing scheduled in the next 48 hours.</p>
            )}
            <ul className="divide-y divide-[var(--rule)]">
              {data.upNext.dueWithin48h.map((article) => (
                <li key={article.id} className="py-2">
                  <p className="truncate text-sm text-[var(--ink)]">{article.title}</p>
                  <p className="font-mono text-xs text-[var(--muted)]">{formatDate(article.publishedAt)}</p>
                </li>
              ))}
            </ul>
            {data.upNext.dueWithin48hTotal > data.upNext.dueWithin48h.length && (
              <p className="mt-2 font-mono text-xs text-[var(--muted)]">
                …and {data.upNext.dueWithin48hTotal - data.upNext.dueWithin48h.length} more
              </p>
            )}
          </Tile>

          <Tile title="Readers">
            {readersHasHistory ? (
              <div className="flex gap-6">
                <Stat label="New sign-ups (7d)" value={data.readers.newLast7d} />
                <Stat label="Signed in (30d)" value={data.readers.activeLast30d} />
              </div>
            ) : (
              <p className="text-sm text-[var(--muted)]">No reader sign-in activity yet.</p>
            )}
          </Tile>

          {/* Traffic, as distinct from the "Readers" tile above it, which counts accounts. The
              labels say "reads" rather than "views" so the two tiles cannot be read as measuring
              the same thing. */}
          <Tile title="Readership">
            {readershipHasHistory ? (
              <>
                <div className="flex gap-6">
                  <Stat label="Reads (7d)" value={data.readership.last7dViews} />
                  {/* Deduplicated per visitor per day and then summed across the window — not a
                      distinct-people count for the week (packages/contracts/src/dashboard.ts). */}
                  <Stat label="Unique reads (7d)" value={data.readership.last7dUniqueViews} />
                </div>
                {data.readership.topArticles.length > 0 && (
                  <>
                    <p className="mb-1 mt-4 font-mono text-[10px] uppercase tracking-widest text-[var(--muted)]">
                      Most read (30d)
                    </p>
                    <ul className="divide-y divide-[var(--rule)]">
                      {data.readership.topArticles.map((article) => (
                        <li key={article.id} className="flex justify-between gap-3 py-2">
                          <span className="truncate text-sm text-[var(--ink)]">{article.title}</span>
                          <span className="shrink-0 font-mono text-xs text-[var(--muted)]">{article.views}</span>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </>
            ) : (
              <p className="text-sm text-[var(--muted)]">No article reads recorded yet.</p>
            )}
          </Tile>
        </div>
      </div>
    </div>
  );
}
