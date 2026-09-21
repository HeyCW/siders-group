import { describe, expect, it } from 'vitest';
import { hyperlocalSpotlightResponseSchema, publicHyperlocalSpotlightSchema } from './hyperlocalSpotlight.js';

const ARTICLE_SUMMARY = { id: '11111111-1111-1111-1111-111111111111', title: 'T', slug: 't' };

describe('hyperlocalSpotlightResponseSchema', () => {
  it('accepts a null editorPick and a null resolved article — the ordinary empty state', () => {
    const parsed = hyperlocalSpotlightResponseSchema.parse({
      editorPick: null,
      resolved: null,
      resolvedIsEditorPick: false,
    });
    expect(parsed.editorPick).toBeNull();
    expect(parsed.resolved).toBeNull();
  });

  it('accepts a stored editor pick that is not publicly visible alongside a different resolved article', () => {
    const parsed = hyperlocalSpotlightResponseSchema.parse({
      editorPick: { article: ARTICLE_SUMMARY, status: 'draft', isPubliclyVisible: false },
      resolved: { ...ARTICLE_SUMMARY, id: '22222222-2222-2222-2222-222222222222' },
      resolvedIsEditorPick: false,
    });
    expect(parsed.editorPick?.isPubliclyVisible).toBe(false);
    expect(parsed.resolvedIsEditorPick).toBe(false);
  });
});

describe('publicHyperlocalSpotlightSchema', () => {
  it('accepts a null article for the ordinary empty state', () => {
    const parsed = publicHyperlocalSpotlightSchema.parse({ article: null, isEditorPick: false });
    expect(parsed.article).toBeNull();
  });
});
