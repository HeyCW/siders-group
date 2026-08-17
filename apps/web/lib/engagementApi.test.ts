import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from './authApi';
import {
  getArticleComments,
  getArticleEngagement,
  postArticleComment,
  recordArticleView,
  toggleArticleLike,
} from './engagementApi';

const ARTICLE = '11111111-1111-4111-8111-111111111111';

function setCsrfCookie(value: string | null): void {
  document.cookie = 'csrf_token=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
  if (value !== null) {
    document.cookie = `csrf_token=${encodeURIComponent(value)}; path=/`;
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

/** A 204 has no body — `res.json()` rejects, which `rawFetch` swallows into `undefined`. */
function noContentResponse(): Response {
  return {
    ok: true,
    status: 204,
    json: async () => {
      throw new Error('no body');
    },
  } as unknown as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
  setCsrfCookie(null);
});

describe('engagementApi', () => {
  it('records a view as a POST and tolerates the 204 with no body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(noContentResponse());
    vi.stubGlobal('fetch', fetchMock);

    await expect(recordArticleView(ARTICLE)).resolves.toBeUndefined();

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`http://localhost:4000/articles/${ARTICLE}/view`);
    expect(init.method).toBe('POST');
  });

  it('sends session credentials on every call, so likedByReader can be resolved', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ success: true, data: { viewCount: 1, likeCount: 0, commentCount: 0, likedByReader: false } }),
      );
    vi.stubGlobal('fetch', fetchMock);

    await getArticleEngagement(ARTICLE);

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.credentials).toBe('include');
  });

  it('attaches the CSRF header on a like, which the API demands of a signed-in POST', async () => {
    setCsrfCookie('token-value');
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ success: true, data: { liked: true, likeCount: 1 } }));
    vi.stubGlobal('fetch', fetchMock);

    await toggleArticleLike(ARTICLE);

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)['x-csrf-token']).toBe('token-value');
  });

  it('sends no CSRF header when the browser holds no session marker', async () => {
    setCsrfCookie(null);
    const fetchMock = vi.fn().mockResolvedValue(noContentResponse());
    vi.stubGlobal('fetch', fetchMock);

    await recordArticleView(ARTICLE);

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)['x-csrf-token']).toBeUndefined();
  });

  it('unwraps the envelope and returns the like toggle result', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ success: true, data: { liked: true, likeCount: 4 } })));

    await expect(toggleArticleLike(ARTICLE)).resolves.toEqual({ liked: true, likeCount: 4 });
  });

  it('passes limit and offset as query parameters when listing comments', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ success: true, data: [] }));
    vi.stubGlobal('fetch', fetchMock);

    await getArticleComments(ARTICLE, { limit: 10, offset: 20 });

    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toBe(`http://localhost:4000/articles/${ARTICLE}/comments?limit=10&offset=20`);
  });

  it('posts a comment body as JSON', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(
        {
          success: true,
          data: {
            id: '22222222-2222-4222-8222-222222222222',
            body: 'Bagus',
            authorName: 'Rina',
            authorAvatarUrl: null,
            createdAt: '2026-08-17T04:00:00.000Z',
          },
        },
        201,
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const comment = await postArticleComment(ARTICLE, 'Bagus');

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.body).toBe(JSON.stringify({ body: 'Bagus' }));
    expect(comment.body).toBe('Bagus');
  });

  it('surfaces the server error code, so callers branch on code rather than message', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({ success: false, error: { code: 'reader_muted', message: 'Reader is muted' } }, 403),
      ),
    );

    await expect(postArticleComment(ARTICLE, 'hi')).rejects.toMatchObject({ code: 'reader_muted', status: 403 });
    await expect(postArticleComment(ARTICLE, 'hi')).rejects.toBeInstanceOf(ApiError);
  });

  it('encodes the article identifier into the path', async () => {
    const fetchMock = vi.fn().mockResolvedValue(noContentResponse());
    vi.stubGlobal('fetch', fetchMock);

    await recordArticleView('a b/c');

    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toBe('http://localhost:4000/articles/a%20b%2Fc/view');
  });
});
