import { revalidatePath } from 'next/cache';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * Called by the scheduled-publish worker (add-news-management-system task 5.1)
 * after flipping an article to published, so ISR pages update within seconds
 * (docs/ARCHITECTURE.md §8.2).
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const secret = req.headers.get('x-revalidate-secret');
  if (!secret || secret !== process.env.REVALIDATE_SECRET) {
    return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 });
  }

  const { path } = (await req.json()) as { path?: string };
  if (!path) {
    return NextResponse.json({ success: false, error: 'missing path' }, { status: 400 });
  }

  revalidatePath(path);
  return NextResponse.json({ success: true, revalidated: path });
}
