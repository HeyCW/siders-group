import { describe, expect, it } from 'vitest';
import { jakartaDateLabel, jakartaWeekStart } from './analytics.repository.js';

/**
 * `jakartaWeekStart`/`jakartaDateLabel` are the JS-side computation of the cadence tile's week
 * boundary — must agree with what `to_char(date_trunc('week', ... AT TIME ZONE 'Asia/Jakarta'),
 * 'YYYY-MM-DD')` produces in SQL for the same instant (tasks.md - 2.3; design.md - "Weeks start
 * Monday"). Asia/Jakarta has no DST, so a fixed +07:00 offset is exact for any date.
 */
describe('jakartaWeekStart', () => {
  it('a Monday midnight Jakarta instant is its own week start', () => {
    // 2026-08-10 is a Monday. 2026-08-10T00:00:00+07:00 = 2026-08-09T17:00:00Z.
    const mondayMidnightJakarta = new Date('2026-08-09T17:00:00.000Z');
    expect(jakartaWeekStart(mondayMidnightJakarta).toISOString()).toBe('2026-08-09T17:00:00.000Z');
  });

  it('a Monday one second before midnight Jakarta belongs to the previous week', () => {
    const justBeforeMonday = new Date('2026-08-09T16:59:59.000Z');
    expect(jakartaWeekStart(justBeforeMonday).toISOString()).toBe('2026-08-02T17:00:00.000Z');
  });

  it('a Sunday, Jakarta-local, still resolves to the preceding Monday', () => {
    // 2026-08-16 is a Sunday. Noon Jakarta = 2026-08-16T05:00:00Z.
    const sundayJakarta = new Date('2026-08-16T05:00:00.000Z');
    expect(jakartaWeekStart(sundayJakarta).toISOString()).toBe('2026-08-09T17:00:00.000Z');
  });

  it('a UTC instant whose Jakarta calendar day differs from its UTC calendar day is bucketed by the Jakarta day', () => {
    // 2026-08-09T18:00:00Z is Sunday in UTC but Monday 01:00 in Jakarta (+7h) — the Jakarta week
    // must start at that Monday, not the UTC Sunday's week.
    const nearUtcBoundary = new Date('2026-08-09T18:00:00.000Z');
    expect(jakartaWeekStart(nearUtcBoundary).toISOString()).toBe('2026-08-09T17:00:00.000Z');
  });

  it('every day of one Jakarta week maps to the same Monday week start', () => {
    const mondayStart = new Date('2026-08-09T17:00:00.000Z').getTime();
    for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
      for (const hourOffset of [0, 6, 12, 23]) {
        const instant = new Date(mondayStart + dayOffset * 24 * 3600 * 1000 + hourOffset * 3600 * 1000);
        expect(jakartaWeekStart(instant).getTime()).toBe(mondayStart);
      }
    }
  });
});

describe('jakartaDateLabel', () => {
  it('formats as YYYY-MM-DD in the Jakarta calendar, not the UTC calendar', () => {
    // 2026-08-09T18:00:00Z is 2026-08-10 in Jakarta.
    expect(jakartaDateLabel(new Date('2026-08-09T18:00:00.000Z'))).toBe('2026-08-10');
  });

  it('is idempotent with jakartaWeekStart: labeling a week start reproduces the same date every time within that week', () => {
    const weekStart = jakartaWeekStart(new Date('2026-08-12T03:00:00.000Z'));
    const label = jakartaDateLabel(weekStart);
    for (let hourOffset = 0; hourOffset < 24; hourOffset++) {
      const sameDay = new Date(weekStart.getTime() + hourOffset * 3600 * 1000);
      expect(jakartaDateLabel(jakartaWeekStart(sameDay))).toBe(label);
    }
  });

  it('pads single-digit months and days', () => {
    // 2026-01-05T00:00:00+07:00 = 2026-01-04T17:00:00Z.
    expect(jakartaDateLabel(new Date('2026-01-04T17:00:00.000Z'))).toBe('2026-01-05');
  });
});
