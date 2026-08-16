import { describe, expect, it } from 'vitest';
import {
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
