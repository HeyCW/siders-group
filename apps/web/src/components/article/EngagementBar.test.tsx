import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ArticleEngagement, CommentResponse } from '@siders/contracts';
import { EngagementBar } from './EngagementBar';
import { ReaderSessionProvider } from '../../lib/readerSession';
import type * as ReactRouterDom from 'react-router-dom';

const ARTICLE = '11111111-1111-4111-8111-111111111111';

const ACCOUNT = {
  id: '33333333-3333-4333-8333-333333333333',
  email: 'reader@example.com',
  name: 'Charles',
  avatarUrl: null,
  status: 'active' as const,
  createdAt: '2026-08-01T00:00:00.000Z',
};

vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof ReactRouterDom>()),
  useLocation: () => ({ pathname: '/news/some-article' }),
}));

const recordArticleView = vi.fn();
const getArticleEngagement = vi.fn();
const getArticleComments = vi.fn();
const toggleArticleLike = vi.fn();
const postArticleComment = vi.fn();

vi.mock('../../lib/engagementApi', () => ({
  recordArticleView: (...args: unknown[]) => recordArticleView(...args),
  getArticleEngagement: (...args: unknown[]) => getArticleEngagement(...args),
  getArticleComments: (...args: unknown[]) => getArticleComments(...args),
  toggleArticleLike: (...args: unknown[]) => toggleArticleLike(...args),
  postArticleComment: (...args: unknown[]) => postArticleComment(...args),
}));

function summary(overrides: Partial<ArticleEngagement> = {}): ArticleEngagement {
  return { viewCount: 1200, likeCount: 3, commentCount: 1, likedByReader: false, ...overrides };
}

function comment(overrides: Partial<CommentResponse> = {}): CommentResponse {
  return {
    id: '22222222-2222-4222-8222-222222222222',
    body: 'Bagus sekali',
    authorName: 'Rina',
    authorAvatarUrl: null,
    createdAt: '2026-08-17T04:00:00.000Z',
    ...overrides,
  };
}

function setCsrfCookie(value: string | null): void {
  document.cookie = 'csrf_token=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
  if (value !== null) document.cookie = `csrf_token=${encodeURIComponent(value)}; path=/`;
}

/** Signed out: no CSRF cookie, so `ReaderSessionProvider` resolves anonymous with no request. */
function renderAnonymous() {
  setCsrfCookie(null);
  vi.stubGlobal('fetch', vi.fn());
  return render(
    <ReaderSessionProvider>
      <EngagementBar articleId={ARTICLE} />
    </ReaderSessionProvider>,
  );
}

/** Signed in: the cookie is present and `GET /auth/me` resolves to an account. */
function renderAuthenticated() {
  setCsrfCookie('token');
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ success: true, data: ACCOUNT }) }),
  );
  return render(
    <ReaderSessionProvider>
      <EngagementBar articleId={ARTICLE} />
    </ReaderSessionProvider>,
  );
}

beforeEach(() => {
  recordArticleView.mockResolvedValue(undefined);
  getArticleEngagement.mockResolvedValue(summary());
  getArticleComments.mockResolvedValue([comment()]);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  setCsrfCookie(null);
  localStorage.clear();
});

describe('EngagementBar — loading', () => {
  it('shows a skeleton before the counts arrive, not a provisional number', () => {
    getArticleEngagement.mockReturnValue(new Promise(() => {}));
    getArticleComments.mockReturnValue(new Promise(() => {}));

    renderAnonymous();

    expect(screen.getByText(/memuat aktivitas artikel/i)).toBeInTheDocument();
    expect(screen.queryByText(/kali dibaca/i)).not.toBeInTheDocument();
  });

  it('reserves the loaded bar"s height, so the article below does not shift', async () => {
    getArticleEngagement.mockReturnValue(new Promise(() => {}));
    getArticleComments.mockReturnValue(new Promise(() => {}));

    const { container } = renderAnonymous();
    const skeletonFrame = container.querySelector('.min-h-\\[58px\\]');

    expect(skeletonFrame).not.toBeNull();
    expect(skeletonFrame?.className).toContain('border-y-[3px]');
  });
});

describe('EngagementBar — the mount sequence', () => {
  it('records the view before reading the counts, so the reader"s own view is included', async () => {
    const order: string[] = [];
    recordArticleView.mockImplementation(async () => {
      order.push('view');
    });
    getArticleEngagement.mockImplementation(async () => {
      order.push('engagement');
      return summary();
    });

    renderAnonymous();

    await screen.findByText(/kali dibaca/i);
    expect(order[0]).toBe('view');
    expect(order).toContain('engagement');
  });

  it('still shows the counts when recording the view fails or is rate limited', async () => {
    recordArticleView.mockRejectedValue(new Error('429'));

    renderAnonymous();

    expect(await screen.findByText('1.200 kali dibaca')).toBeInTheDocument();
  });

  it('reports unavailability rather than rendering zeroes when the counts fail to load', async () => {
    getArticleEngagement.mockRejectedValue(new Error('offline'));

    renderAnonymous();

    expect(await screen.findByText(/sedang tidak tersedia/i)).toBeInTheDocument();
    expect(screen.queryByText(/kali dibaca/i)).not.toBeInTheDocument();
  });

  it('skips the view POST on a second mount for the same article the same day', async () => {
    const { unmount } = renderAnonymous();
    await screen.findByText(/kali dibaca/i);
    expect(recordArticleView).toHaveBeenCalledTimes(1);
    unmount();

    renderAnonymous();
    await screen.findByText(/kali dibaca/i);
    expect(recordArticleView).toHaveBeenCalledTimes(1);
  });

  it('still records a view for a different article', async () => {
    const OTHER_ARTICLE = '44444444-4444-4444-8444-444444444444';
    const { unmount } = renderAnonymous();
    await screen.findByText(/kali dibaca/i);
    unmount();

    setCsrfCookie(null);
    vi.stubGlobal('fetch', vi.fn());
    render(
      <ReaderSessionProvider>
        <EngagementBar articleId={OTHER_ARTICLE} />
      </ReaderSessionProvider>,
    );
    await screen.findByText(/kali dibaca/i);
    expect(recordArticleView).toHaveBeenCalledTimes(2);
    expect(recordArticleView).toHaveBeenLastCalledWith(OTHER_ARTICLE);
  });

  it('retries the view POST next load when the previous attempt failed', async () => {
    recordArticleView.mockRejectedValueOnce(new Error('429'));
    const { unmount } = renderAnonymous();
    await screen.findByText(/kali dibaca/i);
    expect(recordArticleView).toHaveBeenCalledTimes(1);
    unmount();

    recordArticleView.mockResolvedValue(undefined);
    renderAnonymous();
    await screen.findByText(/kali dibaca/i);
    expect(recordArticleView).toHaveBeenCalledTimes(2);
  });

  it('sends the view exactly once under React StrictMode"s double-invoked mount effect', async () => {
    // StrictMode mounts this effect, cleans it up, and remounts it synchronously — before the
    // first attempt's POST has resolved. A gate that only persists the "recorded" flag after the
    // request succeeds would see "not recorded" from both invocations; the in-flight claim in
    // `articleViewGate.ts` is what keeps this at one.
    setCsrfCookie(null);
    vi.stubGlobal('fetch', vi.fn());
    render(
      <StrictMode>
        <ReaderSessionProvider>
          <EngagementBar articleId={ARTICLE} />
        </ReaderSessionProvider>
      </StrictMode>,
    );

    await screen.findByText(/kali dibaca/i);
    expect(recordArticleView).toHaveBeenCalledTimes(1);
  });

  it('shows the view it just recorded rather than a stale pre-view count, under StrictMode', async () => {
    // StrictMode's *first* effect invocation — the one that actually starts the POST — is also
    // the one React discards; only the second invocation's state update ever renders. If that
    // second invocation reads the engagement summary without waiting for the first's POST to
    // land, it renders whatever the count was *before* this view — one short of what the reader
    // should see, and only correct again after a refresh (once the earlier POST has long since
    // committed).
    let viewLanded = false;
    let resolveView: (() => void) | undefined;
    recordArticleView.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveView = () => {
            viewLanded = true;
            resolve();
          };
        }),
    );
    getArticleEngagement.mockImplementation(async () => summary({ viewCount: viewLanded ? 1 : 0 }));

    setCsrfCookie(null);
    vi.stubGlobal('fetch', vi.fn());
    render(
      <StrictMode>
        <ReaderSessionProvider>
          <EngagementBar articleId={ARTICLE} />
        </ReaderSessionProvider>
      </StrictMode>,
    );

    await waitFor(() => expect(recordArticleView).toHaveBeenCalledTimes(1));
    // The engagement summary must not have been read yet — both StrictMode invocations are still
    // waiting on the one recorded view.
    expect(getArticleEngagement).not.toHaveBeenCalled();

    resolveView?.();

    expect(await screen.findByText('1 kali dibaca')).toBeInTheDocument();
  });
});

describe('EngagementBar — signed out', () => {
  it('renders a sign-in prompt in place of the like control, not a disabled button', async () => {
    renderAnonymous();

    await screen.findByText(/untuk menyukai artikel ini/i);
    expect(screen.queryByRole('button', { name: /like/i })).not.toBeInTheDocument();
  });

  it('renders a sign-in prompt in place of the comment composer', async () => {
    renderAnonymous();

    await screen.findByText(/untuk ikut berkomentar/i);
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('still shows existing comments, replacing only the composer', async () => {
    renderAnonymous();

    expect(await screen.findByText('Bagus sekali')).toBeInTheDocument();
  });

  it('returns the reader to the article they were reading', async () => {
    renderAnonymous();

    const links = await screen.findAllByRole('link', { name: /sign in/i });
    const href = links[0]?.getAttribute('href') ?? '';
    expect(href).toContain(encodeURIComponent('/news/some-article'));
  });

  it('offers no reply control on any comment', async () => {
    renderAnonymous();

    await screen.findByText('Bagus sekali');
    expect(screen.queryByRole('button', { name: /balas|reply/i })).not.toBeInTheDocument();
  });
});

describe('EngagementBar — signed in', () => {
  it('renders the like control rather than a prompt', async () => {
    renderAuthenticated();

    expect(await screen.findByRole('button', { name: /like/i })).toBeInTheDocument();
    expect(screen.queryByText(/untuk menyukai artikel ini/i)).not.toBeInTheDocument();
  });

  it('re-reads the summary once the session resolves, correcting a like state read anonymously', async () => {
    // The mount load's `GET /engagement` typically races the session's own resolution and loses
    // it — the first call here stands in for that anonymous read, reporting no like even though
    // the reader has one, exactly as the API would if it received the request before the access
    // cookie was refreshed. The second call is the session-aware re-read.
    getArticleEngagement.mockResolvedValueOnce(summary({ likedByReader: false, likeCount: 3 }));
    getArticleEngagement.mockResolvedValueOnce(summary({ likedByReader: true, likeCount: 4 }));

    renderAuthenticated();
    const button = await screen.findByRole('button', { name: /like/i });

    await waitFor(() => expect(button).toHaveAttribute('aria-pressed', 'true'));
    expect(button.textContent).toContain('4');
    expect(getArticleEngagement).toHaveBeenCalledTimes(2);
  });

  it('does not re-read the summary a second time for a signed-out visitor', async () => {
    renderAnonymous();

    await screen.findByText(/kali dibaca/i);
    // No session ever resolves to authenticated, so the session-aware effect never fires.
    expect(getArticleEngagement).toHaveBeenCalledTimes(1);
  });

  it('updates the like optimistically and then settles on the server"s count', async () => {
    let resolveToggle: ((value: { liked: boolean; likeCount: number }) => void) | undefined;
    toggleArticleLike.mockReturnValue(
      new Promise<{ liked: boolean; likeCount: number }>((resolve) => {
        resolveToggle = resolve;
      }),
    );

    renderAuthenticated();
    const button = await screen.findByRole('button', { name: /like/i });

    fireEvent.click(button);
    // Optimistic: 3 → 4 with no response yet.
    await waitFor(() => expect(button).toHaveAttribute('aria-pressed', 'true'));
    expect(button.textContent).toContain('4');

    // The server disagrees — another reader liked it too — and its number wins.
    resolveToggle?.({ liked: true, likeCount: 9 });
    await waitFor(() => expect(button.textContent).toContain('9'));
  });

  it('rolls the like back when the toggle fails', async () => {
    toggleArticleLike.mockRejectedValue(new Error('offline'));

    renderAuthenticated();
    const button = await screen.findByRole('button', { name: /like/i });

    fireEvent.click(button);

    await waitFor(() => expect(button).toHaveAttribute('aria-pressed', 'false'));
    expect(button.textContent).toContain('3');
  });

  it('places a submitted comment at the top of the list and raises the count', async () => {
    postArticleComment.mockResolvedValue(
      comment({ id: 'new-comment', body: 'Komentar baru', createdAt: '2026-08-18T04:00:00.000Z' }),
    );

    renderAuthenticated();
    const input = await screen.findByRole('textbox');

    fireEvent.change(input, { target: { value: 'Komentar baru' } });
    fireEvent.click(screen.getByRole('button', { name: /kirim/i }));

    await waitFor(() => expect(screen.getByText('Komentar baru')).toBeInTheDocument());
    const bodies = screen.getAllByText(/Komentar baru|Bagus sekali/);
    expect(bodies[0]?.textContent).toBe('Komentar baru');
    expect(await screen.findByText('2 komentar')).toBeInTheDocument();
  });

  it('clears the composer only after the server accepts the comment', async () => {
    postArticleComment.mockResolvedValue(comment({ id: 'new-comment', body: 'Komentar baru' }));

    renderAuthenticated();
    const input = (await screen.findByRole('textbox')) as HTMLTextAreaElement;

    fireEvent.change(input, { target: { value: 'Komentar baru' } });
    fireEvent.click(screen.getByRole('button', { name: /kirim/i }));

    await waitFor(() => expect(input.value).toBe(''));
  });

  it('keeps the reader"s text and reports the reason when the comment is rejected', async () => {
    const { ApiError } = await import('../../lib/authApi');
    postArticleComment.mockRejectedValue(new ApiError('Reader is muted', 403, 'reader_muted'));

    renderAuthenticated();
    const input = (await screen.findByRole('textbox')) as HTMLTextAreaElement;

    fireEvent.change(input, { target: { value: 'Komentar saya' } });
    fireEvent.click(screen.getByRole('button', { name: /kirim/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/dibisukan/i);
    expect(input.value).toBe('Komentar saya');
  });
});

describe('EngagementBar — comment paging', () => {
  it('offers a load-older control only when a full page came back', async () => {
    getArticleComments.mockResolvedValue(
      Array.from({ length: 10 }, (_, i) => comment({ id: `c-${i}`, body: `Komentar ${i}` })),
    );

    renderAnonymous();

    expect(await screen.findByRole('button', { name: /komentar lama/i })).toBeInTheDocument();
  });

  it('offers no load-older control when a partial page came back', async () => {
    renderAnonymous();

    await screen.findByText('Bagus sekali');
    expect(screen.queryByRole('button', { name: /komentar lama/i })).not.toBeInTheDocument();
  });

  it('appends older comments and hides the control at the end of the list', async () => {
    const firstPage = Array.from({ length: 10 }, (_, i) => comment({ id: `c-${i}`, body: `Komentar ${i}` }));
    getArticleComments.mockResolvedValueOnce(firstPage).mockResolvedValueOnce([comment({ id: 'older', body: 'Paling lama' })]);

    renderAnonymous();
    fireEvent.click(await screen.findByRole('button', { name: /komentar lama/i }));

    expect(await screen.findByText('Paling lama')).toBeInTheDocument();
    // The first page is still on screen — appended, not replaced.
    expect(screen.getByText('Komentar 0')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /komentar lama/i })).not.toBeInTheDocument(),
    );
    expect(getArticleComments).toHaveBeenLastCalledWith(ARTICLE, { limit: 10, offset: 10 });
  });
});
