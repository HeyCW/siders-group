import { useEffect, useState } from 'react';
import type { DashboardCadenceBucket, DashboardResponse } from '@siders/contracts';
import { ApiError } from '../lib/api.js';
import { dashboardApi } from '../lib/dashboardApi.js';

function Tile({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-md border border-gray-200 p-4 dark:border-gray-700">
      <h2 className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-200">{title}</h2>
      {children}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="text-2xl font-bold text-gray-900 dark:text-white">{value}</p>
      <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
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
    return <p className="text-sm text-gray-500 dark:text-gray-400">No articles published in this window yet.</p>;
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
                className={`w-full rounded-t ${isCurrentWeek ? 'bg-blue-300 dark:bg-blue-800' : 'bg-blue-600 dark:bg-blue-500'}`}
                style={{ height: `${(bucket.count / max) * 100}%`, minHeight: bucket.count > 0 ? '2px' : '0' }}
                title={`${bucket.weekStart}: ${bucket.count}${isCurrentWeek ? ' (partial week)' : ''}`}
              />
            </div>
            <span className="text-[10px] text-gray-400">{bucket.weekStart.slice(5)}</span>
          </div>
        );
      })}
    </div>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

/**
 * The admin dashboard: six read-only tiles computed entirely from existing data
 * (specs/admin-dashboard/spec.md). No click-throughs and no filters in this change — every tile
 * shows counts (or, for "Up next", the due-soon rows that are its entire point) with no way to
 * drill in further (proposal.md - Non-Goals).
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
      <div className="mx-auto max-w-5xl p-6">
        <p className="text-gray-500 dark:text-gray-400">Loading…</p>
      </div>
    );
  }

  // `/` redirects here unconditionally regardless of the caller's permissions (design.md -
  // "Landing page moves" - "Known gap, explicitly out of scope"), so a staff member without
  // `dashboard.view` lands here and hits this state on every login until admin route guarding
  // exists. This message is the mitigation this change is scoped to provide.
  if (forbidden) {
    return (
      <div className="mx-auto max-w-5xl p-6">
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-300">
          You don&apos;t have permission to view the dashboard.
        </p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="mx-auto max-w-5xl p-6">
        <p className="text-red-600 dark:text-red-400">{error ?? 'Could not load the dashboard'}</p>
      </div>
    );
  }

  const contentDebtTotal =
    data.contentDebt.missingSeoDescription +
    data.contentDebt.missingExcerpt +
    data.contentDebt.missingFeaturedImage +
    data.contentDebt.uncategorized +
    data.contentDebt.unusedTags;

  const readersHasHistory = data.readers.newLast7d > 0 || data.readers.activeLast30d > 0;

  return (
    <div className="mx-auto max-w-5xl p-6">
      <h1 className="mb-6 text-2xl font-bold text-gray-900 dark:text-white">Dashboard</h1>

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
          <p className="mb-3 text-2xl font-bold text-gray-900 dark:text-white">{contentDebtTotal}</p>
          <ul className="space-y-1 text-sm text-gray-600 dark:text-gray-300">
            <li className="flex justify-between">
              <span>Missing SEO description</span>
              <span>{data.contentDebt.missingSeoDescription}</span>
            </li>
            <li className="flex justify-between">
              <span>Missing excerpt</span>
              <span>{data.contentDebt.missingExcerpt}</span>
            </li>
            <li className="flex justify-between">
              <span>Missing featured image</span>
              <span>{data.contentDebt.missingFeaturedImage}</span>
            </li>
            <li className="flex justify-between">
              <span>Uncategorized</span>
              <span>{data.contentDebt.uncategorized}</span>
            </li>
            <li className="flex justify-between">
              <span>Unused tags</span>
              <span>{data.contentDebt.unusedTags}</span>
            </li>
          </ul>
        </Tile>

        <Tile title="Homepage & reels integrity">
          <div className="flex gap-6">
            <div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {data.curationIntegrity.home.visible} / {data.curationIntegrity.home.total}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Homepage curation visible</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {data.curationIntegrity.reels.visible} / {data.curationIntegrity.reels.total}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Reels curation visible</p>
            </div>
          </div>
        </Tile>

        <Tile title="Up next">
          {data.upNext.overdueUnpromotedCount > 0 && (
            <p className="mb-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
              {data.upNext.overdueUnpromotedCount} scheduled article
              {data.upNext.overdueUnpromotedCount === 1 ? ' is' : 's are'} past due — check the publish worker.
            </p>
          )}
          {data.upNext.dueWithin48h.length === 0 && (
            <p className="text-sm text-gray-500 dark:text-gray-400">Nothing scheduled in the next 48 hours.</p>
          )}
          <ul className="divide-y divide-gray-200 dark:divide-gray-700">
            {data.upNext.dueWithin48h.map((article) => (
              <li key={article.id} className="py-2">
                <p className="truncate text-sm text-gray-900 dark:text-white">{article.title}</p>
                <p className="text-xs text-gray-400">{formatDate(article.publishedAt)}</p>
              </li>
            ))}
          </ul>
          {data.upNext.dueWithin48hTotal > data.upNext.dueWithin48h.length && (
            <p className="mt-2 text-xs text-gray-400">
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
            <p className="text-sm text-gray-500 dark:text-gray-400">No reader sign-in activity yet.</p>
          )}
        </Tile>
      </div>
    </div>
  );
}
