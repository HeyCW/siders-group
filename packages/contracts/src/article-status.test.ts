import { describe, expect, it } from 'vitest';
import { ARTICLE_STATUSES, articleStatusSchema } from './article-status.js';

describe('articleStatusSchema', () => {
  it('accepts every defined status', () => {
    for (const status of ARTICLE_STATUSES) {
      expect(articleStatusSchema.parse(status)).toBe(status);
    }
  });

  it('rejects a value outside the enum', () => {
    expect(() => articleStatusSchema.parse('archived')).toThrow();
  });
});
