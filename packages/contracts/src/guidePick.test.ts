import { describe, expect, it } from 'vitest';
import {
  guidePickCreateRequestSchema,
  guidePickReorderRequestSchema,
  guidePickUpdateRequestSchema,
} from './guidePick.js';

const id = (n: number) => `11111111-1111-1111-1111-${String(n).padStart(12, '0')}`;

describe('guidePickCreateRequestSchema', () => {
  it('accepts a valid create request', () => {
    const parsed = guidePickCreateRequestSchema.parse({
      city: 'Surabaya',
      place: 'Seven Cafe',
      description: 'Wifi kuat dan buka sampai tengah malam.',
      photoMediaId: id(1),
      videoMediaId: id(2),
    });
    expect(parsed.photoMediaId).toBe(id(1));
    expect(parsed.videoMediaId).toBe(id(2));
  });

  it('requires photoMediaId', () => {
    const result = guidePickCreateRequestSchema.safeParse({
      city: 'Surabaya',
      place: 'Seven Cafe',
      description: 'Wifi kuat dan buka sampai tengah malam.',
      videoMediaId: id(2),
    });
    expect(result.success).toBe(false);
  });

  it('requires videoMediaId', () => {
    const result = guidePickCreateRequestSchema.safeParse({
      city: 'Surabaya',
      place: 'Seven Cafe',
      description: 'Wifi kuat dan buka sampai tengah malam.',
      photoMediaId: id(1),
    });
    expect(result.success).toBe(false);
  });

  it('rejects a non-uuid photoMediaId', () => {
    const result = guidePickCreateRequestSchema.safeParse({
      city: 'Surabaya',
      place: 'Seven Cafe',
      description: 'Wifi kuat dan buka sampai tengah malam.',
      photoMediaId: 'not-a-uuid',
      videoMediaId: id(2),
    });
    expect(result.success).toBe(false);
  });

  it('rejects a non-uuid videoMediaId', () => {
    const result = guidePickCreateRequestSchema.safeParse({
      city: 'Surabaya',
      place: 'Seven Cafe',
      description: 'Wifi kuat dan buka sampai tengah malam.',
      photoMediaId: id(1),
      videoMediaId: 'not-a-uuid',
    });
    expect(result.success).toBe(false);
  });

  it('rejects an extra field, such as a client-supplied sortOrder', () => {
    const result = guidePickCreateRequestSchema.safeParse({
      city: 'Surabaya',
      place: 'Seven Cafe',
      description: 'Wifi kuat dan buka sampai tengah malam.',
      photoMediaId: id(1),
      videoMediaId: id(2),
      sortOrder: 0,
    });
    expect(result.success).toBe(false);
  });

  it('accepts a valid http(s) Instagram URL', () => {
    const parsed = guidePickCreateRequestSchema.parse({
      city: 'Surabaya',
      place: 'Seven Cafe',
      description: 'Wifi kuat dan buka sampai tengah malam.',
      videoMediaId: id(2),
      instagramUrl: 'https://instagram.com/p/abc123',
    });
    expect(parsed.instagramUrl).toBe('https://instagram.com/p/abc123');
  });

  it('accepts a create request with no instagramUrl at all', () => {
    const parsed = guidePickCreateRequestSchema.parse({
      city: 'Surabaya',
      place: 'Seven Cafe',
      description: 'Wifi kuat dan buka sampai tengah malam.',
      videoMediaId: id(2),
    });
    expect(parsed.instagramUrl).toBeUndefined();
  });

  it('accepts an explicit null instagramUrl', () => {
    const parsed = guidePickCreateRequestSchema.parse({
      city: 'Surabaya',
      place: 'Seven Cafe',
      description: 'Wifi kuat dan buka sampai tengah malam.',
      videoMediaId: id(2),
      instagramUrl: null,
    });
    expect(parsed.instagramUrl).toBeNull();
  });

  /**
   * `z.string().url()` alone accepts every one of these — `new URL()` parses any scheme. This
   * value reaches an `href` on the public home page, so the scheme allowlist is what stops a
   * `news.manage` holder from planting executable script there
   * (specs/guide-of-the-week-management/spec.md - "A non-http(s) Instagram URL is rejected").
   */
  it.each(['javascript:alert(1)', 'data:text/html,<script>alert(1)</script>', 'not-a-url'])(
    'rejects the non-http(s) instagramUrl %s',
    (instagramUrl) => {
      const result = guidePickCreateRequestSchema.safeParse({
        city: 'Surabaya',
        place: 'Seven Cafe',
        description: 'Wifi kuat dan buka sampai tengah malam.',
        videoMediaId: id(2),
        instagramUrl,
      });
      expect(result.success).toBe(false);
    },
  );
});

describe('guidePickUpdateRequestSchema', () => {
  it('accepts an active-only update', () => {
    const parsed = guidePickUpdateRequestSchema.parse({ isActive: false });
    expect(parsed.isActive).toBe(false);
  });

  it('does not accept sortOrder — order changes only via the reorder endpoint', () => {
    const result = guidePickUpdateRequestSchema.safeParse({ sortOrder: 2 });
    expect(result.success).toBe(false);
  });

  it('rejects a non-http(s) scheme on update, the same as on create', () => {
    const result = guidePickUpdateRequestSchema.safeParse({ instagramUrl: 'javascript:alert(1)' });
    expect(result.success).toBe(false);
  });

  it('accepts an explicit null instagramUrl to clear it', () => {
    const parsed = guidePickUpdateRequestSchema.parse({ instagramUrl: null });
    expect(parsed.instagramUrl).toBeNull();
  });
});

describe('guidePickReorderRequestSchema', () => {
  it('accepts an ordered list of guide-pick ids', () => {
    const parsed = guidePickReorderRequestSchema.parse({ guidePickIds: [id(1), id(2)] });
    expect(parsed.guidePickIds).toEqual([id(1), id(2)]);
  });

  it('accepts an empty list', () => {
    const parsed = guidePickReorderRequestSchema.parse({ guidePickIds: [] });
    expect(parsed.guidePickIds).toEqual([]);
  });

  it('accepts a list larger than any other admin-managed list in this system permits — no cap', () => {
    const many = Array.from({ length: 25 }, (_, i) => id(i + 1));
    const parsed = guidePickReorderRequestSchema.parse({ guidePickIds: many });
    expect(parsed.guidePickIds).toHaveLength(25);
  });

  it('rejects duplicate ids', () => {
    const result = guidePickReorderRequestSchema.safeParse({ guidePickIds: [id(1), id(1)] });
    expect(result.success).toBe(false);
  });
});
