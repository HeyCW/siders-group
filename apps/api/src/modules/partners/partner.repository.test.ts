import { describe, expect, it } from 'vitest';
import { isExactPartnerIdSet } from './partner.repository.js';

/**
 * `isExactPartnerIdSet` is the rule `reorder` enforces inside its transaction: the submitted
 * collection must name every existing partner, nothing more and nothing fewer
 * (specs/partner-management/spec.md - "Missing or unknown identifiers are rejected").
 *
 * It is tested here rather than through the service, because `partner.service.test.ts` fakes the
 * repository — a fake told to throw `invalid_partner_set` proves only that the service propagates
 * the error, never that this comparison rejects anything. Same reason `article.repository.ts`
 * exports `isPubliclyVisible` and tests it directly: this repo has no live-database harness, so
 * the pure half of a query gets extracted and pinned instead.
 */
const A = '11111111-1111-1111-1111-000000000001';
const B = '11111111-1111-1111-1111-000000000002';
const C = '11111111-1111-1111-1111-000000000003';

const CASES: { why: string; current: string[]; submitted: string[]; matches: boolean }[] = [
  { why: 'same members in the same order', current: [A, B], submitted: [A, B], matches: true },
  { why: 'same members reordered — the whole point of the endpoint', current: [A, B], submitted: [B, A], matches: true },
  { why: 'both empty: reordering nothing is vacuously exact', current: [], submitted: [], matches: true },
  { why: 'omits an existing partner', current: [A, B], submitted: [A], matches: false },
  { why: 'names a partner that does not exist', current: [A], submitted: [A, C], matches: false },
  { why: 'right length, wrong member', current: [A, B], submitted: [A, C], matches: false },
  { why: 'submits nothing while partners exist', current: [A, B], submitted: [], matches: false },
  { why: 'submits ids while the directory is empty', current: [], submitted: [A], matches: false },
  {
    why: 'duplicate padding to the right length still fails — the contract rejects duplicates first, this is the backstop',
    current: [A, B],
    submitted: [A, A],
    matches: false,
  },
];

describe('isExactPartnerIdSet', () => {
  for (const { why, current, submitted, matches } of CASES) {
    it(`${matches ? 'accepts' : 'rejects'}: ${why}`, () => {
      expect(isExactPartnerIdSet(current, submitted)).toBe(matches);
    });
  }

  it('does not depend on the order rows come back from Postgres', () => {
    expect(isExactPartnerIdSet([B, A, C], [A, B, C])).toBe(true);
  });
});
