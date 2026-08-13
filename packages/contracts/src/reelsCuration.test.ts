import { describe, expect, it } from 'vitest';
import { MAX_REELS_CURATION_ENTRIES, reelsCurationReplaceRequestSchema } from './reelsCuration.js';

const id = (n: number) => `11111111-1111-1111-1111-${String(n).padStart(12, '0')}`;

describe('reelsCurationReplaceRequestSchema', () => {
  it('accepts an empty list — there is no minimum', () => {
    const parsed = reelsCurationReplaceRequestSchema.parse({ reelIds: [] });
    expect(parsed.reelIds).toEqual([]);
  });

  it('accepts up to the maximum number of entries', () => {
    const reelIds = Array.from({ length: MAX_REELS_CURATION_ENTRIES }, (_, i) => id(i));
    const parsed = reelsCurationReplaceRequestSchema.parse({ reelIds });
    expect(parsed.reelIds).toHaveLength(MAX_REELS_CURATION_ENTRIES);
  });

  it('rejects more than the maximum number of entries', () => {
    const reelIds = Array.from({ length: MAX_REELS_CURATION_ENTRIES + 1 }, (_, i) => id(i));
    const result = reelsCurationReplaceRequestSchema.safeParse({ reelIds });
    expect(result.success).toBe(false);
  });

  it('rejects a duplicate id within the submitted array', () => {
    const result = reelsCurationReplaceRequestSchema.safeParse({ reelIds: [id(1), id(2), id(1)] });
    expect(result.success).toBe(false);
  });

  it('rejects a position field — positions are derived server-side from array order', () => {
    const result = reelsCurationReplaceRequestSchema.safeParse({ reelIds: [id(1)], position: 0 });
    expect(result.success).toBe(false);
  });

  it('rejects a non-uuid entry', () => {
    const result = reelsCurationReplaceRequestSchema.safeParse({ reelIds: ['not-a-uuid'] });
    expect(result.success).toBe(false);
  });
});
