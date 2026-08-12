import { describe, expect, it } from 'vitest';
import { slugify, slugifyRequired } from './slugify.js';

describe('slugify', () => {
  it('converts a title to a kebab-case slug', () => {
    expect(slugify('Local Team Wins Regional Cup')).toBe('local-team-wins-regional-cup');
  });

  it('strips diacritics rather than dropping the whole word', () => {
    expect(slugify('Café con Leche')).toBe('cafe-con-leche');
  });

  it('collapses punctuation and repeated separators', () => {
    expect(slugify('  ---Weird!!  Title???---  ')).toBe('weird-title');
  });

  it('returns an empty string for input with no ASCII alphanumerics', () => {
    expect(slugify('!!!')).toBe('');
    expect(slugify('---')).toBe('');
    expect(slugify('   ')).toBe('');
    expect(slugify('你好')).toBe('');
  });
});

describe('slugifyRequired', () => {
  it('returns the same value as slugify for usable input', () => {
    expect(slugifyRequired('Breaking News', 'Title')).toBe('breaking-news');
  });

  it('throws invalid_slug for input that slugifies to empty, naming the subject', () => {
    expect(() => slugifyRequired('!!!', 'Title')).toThrowError(
      expect.objectContaining({ code: 'invalid_slug', message: expect.stringContaining('Title') }),
    );
  });

  it('throws for punctuation-only, whitespace-only, and non-ASCII-only input', () => {
    for (const value of ['---', '   ', '你好']) {
      expect(() => slugifyRequired(value, 'Category name')).toThrowError(
        expect.objectContaining({ code: 'invalid_slug' }),
      );
    }
  });
});
