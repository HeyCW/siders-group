import { describe, expect, it } from 'vitest';
import { isExactGuidePickIdSet } from './guidePick.repository.js';

/**
 * `isExactGuidePickIdSet` is the rule `reorder` enforces inside its transaction: the submitted
 * collection must name every existing guide pick, nothing more and nothing fewer
 * (specs/guide-of-the-week-management/spec.md - "Reorder submits every existing id").
 *
 * Tested here rather than through the service, because `guidePick.service.test.ts` fakes the
 * repository — a fake told to throw `invalid_guide_pick_set` proves only that the service
 * propagates the error, never that this comparison rejects anything. Mirrors
 * `partner.repository.test.ts`'s `isExactPartnerIdSet` tests.
 */
const A = '11111111-1111-1111-1111-000000000001';
const B = '11111111-1111-1111-1111-000000000002';
const C = '11111111-1111-1111-1111-000000000003';

const CASES: { why: string; current: string[]; submitted: string[]; matches: boolean }[] = [
  { why: 'same members in the same order', current: [A, B], submitted: [A, B], matches: true },
  { why: 'same members reordered — the whole point of the endpoint', current: [A, B], submitted: [B, A], matches: true },
  { why: 'both empty: reordering nothing is vacuously exact', current: [], submitted: [], matches: true },
  { why: 'omits an existing guide pick', current: [A, B], submitted: [A], matches: false },
  { why: 'names a guide pick that does not exist', current: [A], submitted: [A, C], matches: false },
  { why: 'right length, wrong member', current: [A, B], submitted: [A, C], matches: false },
  { why: 'submits nothing while guide picks exist', current: [A, B], submitted: [], matches: false },
  { why: 'submits ids while the list is empty', current: [], submitted: [A], matches: false },
  {
    why: 'duplicate padding to the right length still fails — the contract rejects duplicates first, this is the backstop',
    current: [A, B],
    submitted: [A, A],
    matches: false,
  },
];

describe('isExactGuidePickIdSet', () => {
  for (const { why, current, submitted, matches } of CASES) {
    it(`${matches ? 'accepts' : 'rejects'}: ${why}`, () => {
      expect(isExactGuidePickIdSet(current, submitted)).toBe(matches);
    });
  }

  it('does not depend on the order rows come back from Postgres', () => {
    expect(isExactGuidePickIdSet([B, A, C], [A, B, C])).toBe(true);
  });

  it('accepts a large set with no cap of its own', () => {
    const many = Array.from({ length: 30 }, (_, i) => `id-${i}`);
    expect(isExactGuidePickIdSet(many, [...many].reverse())).toBe(true);
  });
});
