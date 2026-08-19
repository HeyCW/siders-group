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
    });
    expect(parsed.photoMediaId).toBe(id(1));
  });

  it('requires photoMediaId', () => {
    const result = guidePickCreateRequestSchema.safeParse({
      city: 'Surabaya',
      place: 'Seven Cafe',
      description: 'Wifi kuat dan buka sampai tengah malam.',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a non-uuid photoMediaId', () => {
    const result = guidePickCreateRequestSchema.safeParse({
      city: 'Surabaya',
      place: 'Seven Cafe',
      description: 'Wifi kuat dan buka sampai tengah malam.',
      photoMediaId: 'not-a-uuid',
    });
    expect(result.success).toBe(false);
  });

  it('rejects an extra field, such as a client-supplied sortOrder', () => {
    const result = guidePickCreateRequestSchema.safeParse({
      city: 'Surabaya',
      place: 'Seven Cafe',
      description: 'Wifi kuat dan buka sampai tengah malam.',
      photoMediaId: id(1),
      sortOrder: 0,
    });
    expect(result.success).toBe(false);
  });
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
