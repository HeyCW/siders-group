import { describe, expect, it } from 'vitest';
import { excerptFromHtml } from './htmlExcerpt.js';

describe('excerptFromHtml', () => {
  it('strips tags and collapses whitespace', () => {
    expect(excerptFromHtml('<p>Hello <strong>world</strong></p>\n<p>Again</p>', 160)).toBe('Hello world Again');
  });

  it('decodes escaped entities from sanitized markup', () => {
    expect(excerptFromHtml('<p>Fish &amp; chips &lt;3</p>', 160)).toBe('Fish & chips <3');
  });

  it('returns the full text unchanged when under the limit', () => {
    expect(excerptFromHtml('<p>Short</p>', 160)).toBe('Short');
  });

  it('truncates at a word boundary and appends an ellipsis when over the limit', () => {
    const html = `<p>${'word '.repeat(40).trim()}</p>`;
    const result = excerptFromHtml(html, 20);
    expect(result.length).toBeLessThanOrEqual(21);
    expect(result.endsWith('…')).toBe(true);
    expect(result).not.toContain('  ');
  });

  it('returns an empty string for empty or whitespace-only markup', () => {
    expect(excerptFromHtml('', 160)).toBe('');
    expect(excerptFromHtml('<p>   </p>', 160)).toBe('');
  });
});
