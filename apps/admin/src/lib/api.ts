const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';

export interface ApiRequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
}

interface ErrorEnvelope {
  success: false;
  error: { code: string; message: string };
}

/**
 * Carries the server's error `code` and HTTP `status` alongside the message, so a caller can
 * react to a specific failure (e.g. `code === 'slug_conflict'`) or to `status === 403` — the
 * latter is how the admin UI treats a permission denial as authoritative rather than
 * pre-computing the caller's permissions client-side
 * (specs/article-management/spec.md - "Permission-gated article endpoints").
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

function isErrorEnvelope(value: unknown): value is ErrorEnvelope {
  return typeof value === 'object' && value !== null && 'error' in value;
}

/** Typed fetch wrapper; always sends the session cookie, never a bearer token. */
export async function apiFetch<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const { body, ...rest } = options;
  const init: RequestInit = {
    ...rest,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
  }

  const res = await fetch(`${API_URL}${path}`, init);
  const payload: unknown = await res.json().catch(() => undefined);

  if (!res.ok) {
    const envelope = isErrorEnvelope(payload) ? payload.error : undefined;
    throw new ApiError(envelope?.message ?? `Request to ${path} failed with status ${res.status}`, res.status, envelope?.code);
  }

  return payload as T;
}

/**
 * Multipart upload — deliberately not routed through `apiFetch`, which always sets
 * `Content-Type: application/json` and JSON-encodes the body. A `FormData` body needs the
 * browser to set its own `multipart/form-data; boundary=...` header.
 */
export async function apiUpload<T>(path: string, formData: FormData): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, { method: 'POST', credentials: 'include', body: formData });
  const payload: unknown = await res.json().catch(() => undefined);

  if (!res.ok) {
    const envelope = isErrorEnvelope(payload) ? payload.error : undefined;
    throw new ApiError(envelope?.message ?? `Upload to ${path} failed with status ${res.status}`, res.status, envelope?.code);
  }

  return payload as T;
}
