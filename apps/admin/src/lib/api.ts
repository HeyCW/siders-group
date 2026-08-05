const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';

export interface ApiRequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
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

  if (!res.ok) {
    throw new Error(`Request to ${path} failed with status ${res.status}`);
  }

  return (await res.json()) as T;
}
