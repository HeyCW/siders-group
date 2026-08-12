import { timingSafeEqual } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { NextResponse, type NextRequest } from 'next/server';

/** Constant-time secret comparison — a plain `!==` leaks a timing signal proportional to the
 * number of matching leading bytes, which is exactly what an attacker guessing this secret
 * byte-by-byte would exploit. */
function secretsMatch(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/**
 * Called by the scheduled-publish worker (add-news-management-system task 5.1)
 * after flipping an article to published, so ISR pages update within seconds
 * (docs/ARCHITECTURE.md §8.2).
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const secret = req.headers.get('x-revalidate-secret');
  const expected = process.env.REVALIDATE_SECRET;
  if (!secret || !expected || !secretsMatch(secret, expected)) {
    return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 });
  }

  const { path } = (await req.json()) as { path?: string };
  if (!path) {
    return NextResponse.json({ success: false, error: 'missing path' }, { status: 400 });
  }

  revalidatePath(path);
  return NextResponse.json({ success: true, revalidated: path });
}
