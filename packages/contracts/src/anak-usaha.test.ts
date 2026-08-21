import { describe, expect, it } from 'vitest';
import {
  anakUsahaKindSchema,
  anakUsahaLinkSchema,
  anakUsahaProfileCreateRequestSchema,
  anakUsahaProfileReorderRequestSchema,
  anakUsahaProfileUpdateRequestSchema,
  anakUsahaAdminResponseSchema,
  publicAnakUsahaSchema,
} from './anak-usaha.js';

const id = (n: number) => `11111111-1111-1111-1111-${String(n).padStart(12, '0')}`;

describe('anakUsahaKindSchema', () => {
  it.each(['Media Platform', 'News & Community'])('accepts %s', (kind) => {
    expect(anakUsahaKindSchema.safeParse(kind).success).toBe(true);
  });

  it('rejects a value outside the fixed set', () => {
    expect(anakUsahaKindSchema.safeParse('Podcast Network').success).toBe(false);
  });
});

describe('anakUsahaLinkSchema', () => {
  it('accepts an http(s) link with a label', () => {
    const parsed = anakUsahaLinkSchema.parse({ label: 'Instagram', href: 'https://instagram.com/siders' });
    expect(parsed.href).toBe('https://instagram.com/siders');
  });

  /** Same hazard `partner.test.ts` covers for `websiteUrl` — this value reaches a public `href`
   *  too (specs/anak-usaha-presentation/spec.md - "A profile link must be http or https"). */
  it.each(['javascript:alert(1)', 'data:text/html,<script>alert(1)</script>', 'vbscript:msgbox(1)'])(
    'rejects the non-http(s) scheme %s',
    (href) => {
      const result = anakUsahaLinkSchema.safeParse({ label: 'Bad', href });
      expect(result.success).toBe(false);
    },
  );

  it('rejects an empty label', () => {
    const result = anakUsahaLinkSchema.safeParse({ label: '', href: 'https://instagram.com/siders' });
    expect(result.success).toBe(false);
  });
});

describe('anakUsahaProfileCreateRequestSchema', () => {
  it('accepts the minimal valid request', () => {
    const parsed = anakUsahaProfileCreateRequestSchema.parse({ kind: 'Media Platform' });
    expect(parsed.kind).toBe('Media Platform');
  });

  it('does not accept an anakUsahaId field — identity comes from the route, not the body', () => {
    const result = anakUsahaProfileCreateRequestSchema.safeParse({ anakUsahaId: id(1), kind: 'Media Platform' });
    expect(result.success).toBe(false);
  });

  it('accepts a nullable logoMediaId', () => {
    const parsed = anakUsahaProfileCreateRequestSchema.parse({ kind: 'Media Platform', logoMediaId: null });
    expect(parsed.logoMediaId).toBeNull();
  });

  it('rejects a kind outside the fixed set', () => {
    const result = anakUsahaProfileCreateRequestSchema.safeParse({ kind: 'Podcast Network' });
    expect(result.success).toBe(false);
  });

  it('rejects a link with a non-http(s) scheme nested inside links', () => {
    const result = anakUsahaProfileCreateRequestSchema.safeParse({
      kind: 'Media Platform',
      links: [{ label: 'Bad', href: 'javascript:alert(1)' }],
    });
    expect(result.success).toBe(false);
  });

  it('accepts an empty links list', () => {
    const parsed = anakUsahaProfileCreateRequestSchema.parse({ kind: 'Media Platform', links: [] });
    expect(parsed.links).toEqual([]);
  });
});

describe('anakUsahaProfileUpdateRequestSchema', () => {
  it('accepts an isActive-only update', () => {
    const parsed = anakUsahaProfileUpdateRequestSchema.parse({ isActive: false });
    expect(parsed.isActive).toBe(false);
  });

  it('does not accept sortOrder — order changes only via the reorder endpoint', () => {
    const result = anakUsahaProfileUpdateRequestSchema.safeParse({ sortOrder: 2 });
    expect(result.success).toBe(false);
  });

  it('accepts an explicit null logoMediaId to clear it', () => {
    const parsed = anakUsahaProfileUpdateRequestSchema.parse({ logoMediaId: null });
    expect(parsed.logoMediaId).toBeNull();
  });
});

describe('anakUsahaProfileReorderRequestSchema', () => {
  it('accepts an ordered list of anak usaha ids', () => {
    const parsed = anakUsahaProfileReorderRequestSchema.parse({ anakUsahaIds: [id(1), id(2)] });
    expect(parsed.anakUsahaIds).toEqual([id(1), id(2)]);
  });

  it('rejects duplicate ids', () => {
    const result = anakUsahaProfileReorderRequestSchema.safeParse({ anakUsahaIds: [id(1), id(1)] });
    expect(result.success).toBe(false);
  });
});

describe('publicAnakUsahaSchema', () => {
  it('accepts the plain shape with no presentation fields', () => {
    const parsed = publicAnakUsahaSchema.parse({ id: id(1), name: 'Siders Culture', slug: 'siders-culture' });
    expect(parsed.kind).toBeUndefined();
  });

  it('accepts the full shape with presentation fields', () => {
    const parsed = publicAnakUsahaSchema.parse({
      id: id(1),
      name: 'Siders Culture',
      slug: 'siders-culture',
      logoUrl: 'https://media.example.com/logo.png',
      description: 'A description',
      kind: 'Media Platform',
      links: [{ label: 'Instagram', href: 'https://instagram.com/siders' }],
      sortOrder: 0,
    });
    expect(parsed.kind).toBe('Media Platform');
  });
});

describe('anakUsahaAdminResponseSchema', () => {
  it('accepts null profile for an entry with none yet', () => {
    const parsed = anakUsahaAdminResponseSchema.parse({
      id: id(1),
      name: 'Siders Culture',
      slug: 'siders-culture',
      profile: null,
    });
    expect(parsed.profile).toBeNull();
  });

  it('accepts a full profile, active or not', () => {
    const parsed = anakUsahaAdminResponseSchema.parse({
      id: id(1),
      name: 'Siders Culture',
      slug: 'siders-culture',
      profile: {
        logoUrl: null,
        description: null,
        kind: 'News & Community',
        links: [],
        sortOrder: 0,
        isActive: false,
      },
    });
    expect(parsed.profile?.isActive).toBe(false);
  });
});
