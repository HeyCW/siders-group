import { afterEach, describe, expect, it, vi } from 'vitest';
import { ensureViewRecorded, hasRecordedViewToday, markViewRecorded } from './articleViewGate';

const ARTICLE = '11111111-1111-4111-8111-111111111111';
const OTHER_ARTICLE = '22222222-2222-4222-8222-222222222222';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
  localStorage.clear();
});

describe('articleViewGate', () => {
  it('reports no recorded view before one is marked', () => {
    expect(hasRecordedViewToday(ARTICLE)).toBe(false);
  });

  it('reports a recorded view for the same article on the same day after marking', () => {
    markViewRecorded(ARTICLE);
    expect(hasRecordedViewToday(ARTICLE)).toBe(true);
  });

  it('keeps a different article unaffected', () => {
    markViewRecorded(ARTICLE);
    expect(hasRecordedViewToday(OTHER_ARTICLE)).toBe(false);
  });

  it('resets on the next calendar day', () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date(2026, 7, 18, 10, 0, 0));
      markViewRecorded(ARTICLE);
      expect(hasRecordedViewToday(ARTICLE)).toBe(true);

      vi.setSystemTime(new Date(2026, 7, 19, 0, 5, 0));
      expect(hasRecordedViewToday(ARTICLE)).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('treats hasRecordedViewToday as false during SSR, with no window to read', () => {
    vi.stubGlobal('window', undefined);
    expect(hasRecordedViewToday(ARTICLE)).toBe(false);
  });

  it('treats markViewRecorded as a no-op during SSR rather than throwing', () => {
    vi.stubGlobal('window', undefined);
    expect(() => markViewRecorded(ARTICLE)).not.toThrow();
  });

  it('falls back to false when localStorage.getItem throws', () => {
    // jsdom's Storage object does not honor `vi.spyOn` on individual methods (the mock is never
    // invoked), so the throwing behavior is stubbed in via a full replacement object instead.
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => undefined,
    });
    expect(hasRecordedViewToday(ARTICLE)).toBe(false);
  });

  it('swallows a localStorage.setItem failure instead of throwing', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => {
        throw new Error('quota exceeded');
      },
    });
    expect(() => markViewRecorded(ARTICLE)).not.toThrow();
    // The write never landed, so a later check still sees no recorded view.
    expect(hasRecordedViewToday(ARTICLE)).toBe(false);
  });
});

describe('ensureViewRecorded', () => {
  it('calls send and marks the view once it resolves', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    await ensureViewRecorded('first-view', send);
    expect(send).toHaveBeenCalledTimes(1);
    expect(hasRecordedViewToday('first-view')).toBe(true);
  });

  it('does not call send again for an article/day already recorded', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    await ensureViewRecorded('already-recorded', send);

    await ensureViewRecorded('already-recorded', send);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('leaves the view unmarked after send rejects, so a later call retries', async () => {
    const send = vi.fn().mockRejectedValueOnce(new Error('429')).mockResolvedValue(undefined);

    await ensureViewRecorded('retry-me', send);
    expect(hasRecordedViewToday('retry-me')).toBe(false);
    expect(send).toHaveBeenCalledTimes(1);

    await ensureViewRecorded('retry-me', send);
    expect(hasRecordedViewToday('retry-me')).toBe(true);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('shares one in-flight attempt across concurrent callers rather than starting a second request', async () => {
    // This is the StrictMode double-mount race: two callers reach `ensureViewRecorded` before
    // either has gotten a response back. Only one may start the request, and — the part a bare
    // "skip if already claimed" check misses — the other must not resolve (and so must not read
    // engagement counts) before that one request actually lands.
    const send = vi.fn();
    let resolveSend: (() => void) | undefined;
    send.mockImplementation(() => new Promise<void>((resolve) => (resolveSend = resolve)));

    const first = ensureViewRecorded('concurrent', send);
    const second = ensureViewRecorded('concurrent', send);
    expect(send).toHaveBeenCalledTimes(1);

    let secondSettled = false;
    void second.then(() => {
      secondSettled = true;
    });

    // Flush pending microtasks without resolving `send` — the second caller must still be
    // waiting on the first's attempt, not settled already.
    await Promise.resolve();
    await Promise.resolve();
    expect(secondSettled).toBe(false);

    resolveSend?.();
    await first;
    await second;

    expect(secondSettled).toBe(true);
    expect(hasRecordedViewToday('concurrent')).toBe(true);
  });
});
