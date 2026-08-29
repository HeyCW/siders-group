import type {
  ArticlePublicCard,
  ArticlePublicDetail,
  CategoryResponse,
  ContactMessageSubmitRequest,
  ContactMessageSubmitResponse,
  PublicAnakUsaha,
  PublicGuidePick,
  PublicPartner,
} from '@siders/contracts';
import { API_URL } from './env';

interface ErrorEnvelope {
  success: false;
  error: { code: string; message: string };
}

function isErrorEnvelope(value: unknown): value is ErrorEnvelope {
  return typeof value === 'object' && value !== null && 'error' in value;
}

/**
 * Carries the server's error `code` and HTTP `status`, matching `apps/admin/src/lib/api.ts`'s
 * `ApiError` — same shape, but this client is deliberately a much smaller subset of it: every
 * endpoint called here is `requirePublic()`, so there is no CSRF header, no session cookie, and
 * no 401/403 recovery cycle to carry (`docs/ARCHITECTURE.md` §8.1 reserves that machinery for
 * the future reader-engagement cycle, out of scope per `add-web-news-pages/proposal.md` —
 * Non-Goals).
 */
export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * `cache` is left to the caller rather than fixed here, because `/`, `/news`, and `/news/[slug]`
 * each need a different fetch caching behavior to implement the route strategy table in
 * `docs/ARCHITECTURE.md` §8.1 (`design.md` — "The fetch client is a plain public reader").
 */
async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, init);
  const payload: unknown = await res.json().catch(() => undefined);

  if (!res.ok || (isErrorEnvelope(payload) && payload.success === false)) {
    const envelope = isErrorEnvelope(payload) ? payload.error : undefined;
    throw new ApiError(
      envelope?.message ?? `Request to ${path} failed with status ${res.status}`,
      res.status,
      envelope?.code,
    );
  }

  return (payload as { data: T }).data;
}

export interface GetArticlesParams {
  categorySlugs?: string[] | undefined;
  anakUsahaSlugs?: string[] | undefined;
  publishedAfter?: string | undefined;
  publishedBefore?: string | undefined;
  limit?: number;
  offset?: number;
  excludeIds?: string[];
}

function buildQuery(params: Record<string, string | number | string[] | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      if (value.length > 0) search.set(key, value.join(','));
    } else {
      search.set(key, String(value));
    }
  }
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}

export function getArticles(
  params: GetArticlesParams = {},
  init?: RequestInit,
): Promise<ArticlePublicCard[]> {
  const qs = buildQuery({
    categorySlugs: params.categorySlugs,
    anakUsahaSlugs: params.anakUsahaSlugs,
    publishedAfter: params.publishedAfter,
    publishedBefore: params.publishedBefore,
    limit: params.limit,
    offset: params.offset,
    excludeIds: params.excludeIds,
  });
  return apiFetch<ArticlePublicCard[]>(`/articles${qs}`, init);
}

export function getArticleBySlug(slug: string, init?: RequestInit): Promise<ArticlePublicDetail> {
  return apiFetch<ArticlePublicDetail>(`/articles/${encodeURIComponent(slug)}`, init);
}

export function getHomeFeed(limit?: number, init?: RequestInit): Promise<ArticlePublicCard[]> {
  const qs = buildQuery({ limit });
  return apiFetch<ArticlePublicCard[]>(`/home${qs}`, init);
}

export function getCategories(init?: RequestInit): Promise<CategoryResponse[]> {
  return apiFetch<CategoryResponse[]>('/categories', init);
}

/**
 * Every anak usaha entry, `{id, name, slug}` plus presentation fields only for one with an active
 * profile — the `/news` filter and article editor read only the plain shape, unaffected by the
 * added optional fields; `presentedAnakUsaha` (lib/anakUsaha.ts) narrows to what the public site's
 * Anak Usaha section actually renders (design.md - "Public data folded into the existing
 * GET /anak-usaha endpoint").
 */
export function getAnakUsahaList(init?: RequestInit): Promise<PublicAnakUsaha[]> {
  return apiFetch<PublicAnakUsaha[]>('/anak-usaha', init);
}

export function getPartners(init?: RequestInit): Promise<PublicPartner[]> {
  return apiFetch<PublicPartner[]>('/partners', init);
}

export function getGuidePicks(init?: RequestInit): Promise<PublicGuidePick[]> {
  return apiFetch<PublicGuidePick[]>('/guide-picks', init);
}

/**
 * The one write this client makes — every other function here reads. Still `requirePublic()` on
 * the server, so the same no-credentials, no-CSRF `apiFetch` above handles it unchanged
 * (specs/contact-messages/spec.md - "Any visitor can submit a contact message without
 * authentication").
 */
export function submitContactMessage(
  input: ContactMessageSubmitRequest,
): Promise<ContactMessageSubmitResponse> {
  return apiFetch<ContactMessageSubmitResponse>('/contact-messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
}
