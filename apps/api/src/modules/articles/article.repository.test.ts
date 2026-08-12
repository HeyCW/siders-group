import { describe, expect, it } from 'vitest';
import type { ArticleStatus } from '@siders/contracts';
import { isPubliclyVisible } from './article.repository.js';

/**
 * `isPubliclyVisible` is the JS twin of the SQL `publiclyVisible()` predicate in the same file:
 * the query layer uses the SQL one to filter public reads, and the article service uses this one
 * to decide whether a write changed public output and therefore needs revalidation.
 *
 * Two hand-synced definitions of one rule is exactly the drift the spec warns about
 * (specs/public-news-api/spec.md - "One canonical public visibility rule"). They cannot share an
 * implementation — one builds a Drizzle `where` clause, the other tests a loaded row — so this
 * table is the lock instead: it states the intended semantics case by case, and any change to
 * either definition that is not mirrored in the other should break a row here.
 *
 * The SQL side reads:
 *   (status = 'published' AND published_at IS NOT NULL)
 *   OR (status = 'scheduled' AND published_at <= now)
 */
const NOW = new Date('2026-08-11T12:00:00.000Z');
const PAST = new Date('2026-08-11T11:59:59.000Z');
const FUTURE = new Date('2026-08-11T12:00:01.000Z');

const CASES: { status: ArticleStatus; publishedAt: Date | null; visible: boolean; why: string }[] = [
  { status: 'published', publishedAt: PAST, visible: true, why: 'published with a past timestamp is live' },
  { status: 'published', publishedAt: NOW, visible: true, why: 'published exactly now is live' },
  {
    status: 'published',
    publishedAt: FUTURE,
    visible: true,
    why: 'the SQL published branch checks only IS NOT NULL, so a future stamp is still served',
  },
  {
    status: 'published',
    publishedAt: null,
    visible: false,
    why: 'excluded by the IS NOT NULL guard rather than reaching a mapper that cannot build a DTO',
  },
  { status: 'scheduled', publishedAt: PAST, visible: true, why: 'the read-time fallback: due but not yet flipped' },
  { status: 'scheduled', publishedAt: NOW, visible: true, why: 'the fallback boundary is inclusive (<=)' },
  { status: 'scheduled', publishedAt: FUTURE, visible: false, why: 'not due yet' },
  { status: 'scheduled', publishedAt: null, visible: false, why: 'SQL lte(NULL, now) is NULL, i.e. not matched' },
  { status: 'draft', publishedAt: null, visible: false, why: 'drafts are never public' },
  {
    status: 'draft',
    publishedAt: PAST,
    visible: false,
    why: 'status wins: an unpublished article with a leftover timestamp stays private',
  },
];

describe('isPubliclyVisible', () => {
  for (const { status, publishedAt, visible, why } of CASES) {
    const stamp = publishedAt === null ? 'null' : publishedAt.toISOString();
    it(`${status} / published_at=${stamp} -> ${visible} (${why})`, () => {
      expect(isPubliclyVisible({ status, publishedAt }, NOW)).toBe(visible);
    });
  }

  it('compares against the caller-supplied instant, not the wall clock', () => {
    const row = { status: 'scheduled' as ArticleStatus, publishedAt: new Date('2026-08-11T12:00:00.000Z') };
    // The same row is invisible before its time and visible after — the service passes the same
    // `now` the query layer binds, so the two never disagree about the boundary.
    expect(isPubliclyVisible(row, new Date('2026-08-11T11:59:59.999Z'))).toBe(false);
    expect(isPubliclyVisible(row, new Date('2026-08-11T12:00:00.001Z'))).toBe(true);
  });
});
