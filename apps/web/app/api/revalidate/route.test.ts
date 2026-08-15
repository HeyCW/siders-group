import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from './route';

// revalidatePath requires Next's request-scoped static generation store, which
// only exists inside the real server runtime. Mock it for this unit test and
// let integration/E2E cover the real invalidation behavior.
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

const ORIGINAL_SECRET = process.env.REVALIDATE_SECRET;

beforeEach(() => {
  process.env.REVALIDATE_SECRET = 'test-secret';
});

afterEach(() => {
  process.env.REVALIDATE_SECRET = ORIGINAL_SECRET;
});

function makeRequest(body: unknown, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest('http://localhost/api/revalidate', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

describe('POST /api/revalidate', () => {
  it('rejects a request without the secret header', async () => {
    const res = await POST(makeRequest({ path: '/news' }));
    expect(res.status).toBe(401);
  });

  it('rejects a request with the wrong secret', async () => {
    const res = await POST(makeRequest({ path: '/news' }, { 'x-revalidate-secret': 'wrong' }));
    expect(res.status).toBe(401);
  });

  it('rejects a request missing a path', async () => {
    const res = await POST(makeRequest({}, { 'x-revalidate-secret': 'test-secret' }));
    expect(res.status).toBe(400);
  });

  it('accepts a correctly authenticated request with a path', async () => {
    const res = await POST(
      makeRequest({ path: '/news' }, { 'x-revalidate-secret': 'test-secret' }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.revalidated).toBe('/news');
  });
});
