import { describe, expect, it } from 'vitest';
import {
  isHttpUrl,
  partnerCreateRequestSchema,
  partnerReorderRequestSchema,
  partnerUpdateRequestSchema,
} from './partner.js';

const id = (n: number) => `11111111-1111-1111-1111-${String(n).padStart(12, '0')}`;

describe('partnerCreateRequestSchema', () => {
  it('accepts a valid create request', () => {
    const parsed = partnerCreateRequestSchema.parse({
      name: 'Acme Corp',
      logoMediaId: id(1),
      websiteUrl: 'https://acme.example.com',
    });
    expect(parsed.logoMediaId).toBe(id(1));
  });

  it('requires logoMediaId', () => {
    const result = partnerCreateRequestSchema.safeParse({
      name: 'Acme Corp',
      websiteUrl: 'https://acme.example.com',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a non-uuid logoMediaId', () => {
    const result = partnerCreateRequestSchema.safeParse({
      name: 'Acme Corp',
      logoMediaId: 'not-a-uuid',
      websiteUrl: 'https://acme.example.com',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a website URL that is not a valid absolute URL', () => {
    const result = partnerCreateRequestSchema.safeParse({
      name: 'Acme Corp',
      logoMediaId: id(1),
      websiteUrl: 'not-a-url',
    });
    expect(result.success).toBe(false);
  });

  it('accepts a create request with no websiteUrl at all', () => {
    const parsed = partnerCreateRequestSchema.parse({ name: 'Acme Corp', logoMediaId: id(1) });
    expect(parsed.websiteUrl).toBeUndefined();
  });

  it('accepts an explicit null websiteUrl', () => {
    const parsed = partnerCreateRequestSchema.parse({ name: 'Acme Corp', logoMediaId: id(1), websiteUrl: null });
    expect(parsed.websiteUrl).toBeNull();
  });

  /** An empty string is not normalized by the schema — the admin form sends `null` for a blank
   *  field instead (design.md - "Validation stays on the shared schema"). */
  it('rejects an empty-string websiteUrl rather than treating it as absent', () => {
    const result = partnerCreateRequestSchema.safeParse({ name: 'Acme Corp', logoMediaId: id(1), websiteUrl: '' });
    expect(result.success).toBe(false);
  });

  /**
   * `z.string().url()` alone accepts every one of these — `new URL()` parses any scheme. They
   * reach an `href` on the public home page, so the scheme allowlist is what stops a
   * `settings.manage` holder from planting executable script there
   * (specs/partner-management/spec.md - "A partner website URL must be http or https").
   */
  it.each(['javascript:alert(1)', 'data:text/html,<script>alert(1)</script>', 'vbscript:msgbox(1)', 'file:///etc/passwd'])(
    'rejects the non-http(s) scheme %s',
    (websiteUrl) => {
      const result = partnerCreateRequestSchema.safeParse({ name: 'Acme Corp', logoMediaId: id(1), websiteUrl });
      expect(result.success).toBe(false);
    },
  );

  it.each(['http://acme.example.com', 'https://acme.example.com/path?q=1'])('accepts %s', (websiteUrl) => {
    const result = partnerCreateRequestSchema.safeParse({ name: 'Acme Corp', logoMediaId: id(1), websiteUrl });
    expect(result.success).toBe(true);
  });

  it('rejects an extra field, such as a client-supplied sortOrder', () => {
    const result = partnerCreateRequestSchema.safeParse({
      name: 'Acme Corp',
      logoMediaId: id(1),
      websiteUrl: 'https://acme.example.com',
      sortOrder: 0,
    });
    expect(result.success).toBe(false);
  });
});

describe('partnerUpdateRequestSchema', () => {
  it('accepts an active-only update', () => {
    const parsed = partnerUpdateRequestSchema.parse({ isActive: false });
    expect(parsed.isActive).toBe(false);
  });

  it('rejects a website URL that is not a valid absolute URL', () => {
    const result = partnerUpdateRequestSchema.safeParse({ websiteUrl: 'not-a-url' });
    expect(result.success).toBe(false);
  });

  it('rejects a non-http(s) scheme on update, the same as on create', () => {
    const result = partnerUpdateRequestSchema.safeParse({ websiteUrl: 'javascript:alert(1)' });
    expect(result.success).toBe(false);
  });

  it('accepts an explicit null websiteUrl to clear it', () => {
    const parsed = partnerUpdateRequestSchema.parse({ websiteUrl: null });
    expect(parsed.websiteUrl).toBeNull();
  });

  it('does not accept sortOrder — order changes only via the reorder endpoint', () => {
    const result = partnerUpdateRequestSchema.safeParse({ sortOrder: 2 });
    expect(result.success).toBe(false);
  });
});

describe('partnerReorderRequestSchema', () => {
  it('accepts an ordered list of partner ids', () => {
    const parsed = partnerReorderRequestSchema.parse({ partnerIds: [id(1), id(2)] });
    expect(parsed.partnerIds).toEqual([id(1), id(2)]);
  });

  it('accepts an empty list', () => {
    const parsed = partnerReorderRequestSchema.parse({ partnerIds: [] });
    expect(parsed.partnerIds).toEqual([]);
  });

  it('rejects duplicate ids', () => {
    const result = partnerReorderRequestSchema.safeParse({ partnerIds: [id(1), id(1)] });
    expect(result.success).toBe(false);
  });
});

describe('isHttpUrl', () => {
  it.each([
    ['https://acme.example.com', true],
    ['http://acme.example.com', true],
    ['javascript:alert(1)', false],
    ['data:text/html,<script>alert(1)</script>', false],
    ['vbscript:msgbox(1)', false],
    ['file:///etc/passwd', false],
    ['mailto:hi@acme.example.com', false],
    ['not-a-url', false],
    ['', false],
  ])('%s -> %s', (value, expected) => {
    expect(isHttpUrl(value)).toBe(expected);
  });
});
