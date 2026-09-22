import { describe, expect, it } from 'vitest';
import { toPreviewResponse, toPublicDetail } from './article.mapper.js';
import type { ArticleWithRelations } from './article.repository.js';

const env = { MEDIA_PUBLIC_BASE_URL: 'https://media.example.com' };

function article(overrides: Partial<ArticleWithRelations> = {}): ArticleWithRelations {
  const bodyJson = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Body.' }] }] };
  return {
    id: 'a1',
    title: 'Title',
    slug: 'title',
    bodyJson,
    // Simulates the stored public HTML the same `bodyJson` would sanitize to — this is what
    // `article.repository.ts` would have written at save time via `sanitizeHtml(bodyJson).html`.
    bodyHtml: '<p>Body.</p>',
    excerpt: null,
    status: 'draft',
    authorId: 'author-1',
    featuredMediaId: null,
    anakUsahaId: null,
    seoTitle: null,
    seoDescription: null,
    publishedAt: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    authorName: 'Jane Author',
    featuredMediaStoragePath: null,
    categories: [],
    anakUsaha: null,
    ...overrides,
  };
}

describe('toPreviewResponse (specs/article-management/spec.md - "Article preview")', () => {
  it('renders bodyHtml from bodyJson rather than returning the stored (public) body_html column', () => {
    const withNote = article({
      bodyJson: {
        type: 'doc',
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: 'Body.' }] },
          { type: 'internalNote', content: [{ type: 'text', text: 'check this fact' }] },
        ],
      },
      // The stored public bodyHtml never contains the note — this is what the article write
      // path would actually have produced (sanitizeHtml runs in 'public' mode by default).
      bodyHtml: '<p>Body.</p>',
    });

    const preview = toPreviewResponse(env, withNote);

    expect(preview.bodyHtml).toContain('check this fact');
    expect(preview.bodyHtml).toContain('internal-note');
  });

  it('matches the public rendering byte-for-byte when the article has no internal notes', () => {
    const plain = article();

    const preview = toPreviewResponse(env, plain);
    const publicDetail = toPublicDetail(env, { ...plain, publishedAt: new Date('2026-01-01T00:00:00Z') });

    expect(preview.bodyHtml).toBe(publicDetail.bodyHtml);
  });

  it('is reachable regardless of status, unlike the public detail read', () => {
    const draft = article({ status: 'draft', publishedAt: null });
    expect(() => toPreviewResponse(env, draft)).not.toThrow();
  });
});

describe('toPublicDetail never re-renders — the stored body_html is returned unchanged', () => {
  it('never contains a note even when bodyJson (inconsistently) still carries one', () => {
    // A defensive case: even if a stale/handcrafted bodyJson still had a note node, the public
    // path must never read it — it only ever returns the already-stored, note-free bodyHtml
    // (specs/article-management/spec.md - "Every public read returns the stored HTML unchanged").
    const inconsistent = article({
      bodyJson: { type: 'doc', content: [{ type: 'internalNote', content: [{ type: 'text', text: 'leak?' }] }] },
      bodyHtml: '<p>Body.</p>',
      status: 'published',
      publishedAt: new Date('2026-01-01T00:00:00Z'),
    });

    const detail = toPublicDetail(env, inconsistent);

    expect(detail.bodyHtml).toBe('<p>Body.</p>');
    expect(detail.bodyHtml).not.toContain('leak');
  });
});
