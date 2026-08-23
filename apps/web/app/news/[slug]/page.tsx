import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ApiError, getArticleBySlug } from '../../../lib/api';
import { estimateReadMinutes } from '../../../lib/readingTime';
import { Container } from '../../../components/layout/Container';
import { MediaSlot } from '../../../components/ui/MediaSlot';
import { EngagementBar } from '../../../components/article/EngagementBar';
import { ShareLinks } from '../../../components/article/ShareLinks';
import { RelatedArticles } from '../../../components/article/RelatedArticles';

export const revalidate = 60;

async function loadArticle(slug: string) {
  try {
    return await getArticleBySlug(slug, { next: { revalidate: 60 } });
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}

export async function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Promise<Metadata> {
  const article = await loadArticle(params.slug);
  if (!article) return {};
  const description = article.seoDescription ?? article.excerpt ?? undefined;
  return {
    title: `${article.seoTitle ?? article.title} — Siders`,
    ...(description ? { description } : {}),
    openGraph: {
      title: article.seoTitle ?? article.title,
      ...(description ? { description } : {}),
      ...(article.featuredImageUrl ? { images: [article.featuredImageUrl] } : {}),
    },
  };
}

export default async function ArticlePage({ params }: { params: { slug: string } }) {
  const article = await loadArticle(params.slug);
  if (!article) notFound();

  const kicker = article.categories[0]?.name ?? 'Siders';
  const readMinutes = estimateReadMinutes(article.bodyHtml);
  const publishedDate = new Date(article.publishedAt).toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  return (
    <Container className="pt-[clamp(20px,3vw,32px)]">
      <Link href="/news" className="font-sans text-[11px] font-bold uppercase tracking-widest">
        ← Back to news
      </Link>

      {/* The rail sits beside the headline and lead image only; the body below spans the whole
          container so the prose is not capped at two thirds of the width. */}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] items-start gap-[clamp(24px,4vw,56px)] pt-[clamp(20px,3vw,32px)]">
        <div className="col-span-2 min-w-0">
          <div className="border-b border-rule pb-2 font-sans text-[11px] font-bold uppercase tracking-widest text-muted">
            {kicker} · {publishedDate}
          </div>
          <h1 className="mt-4 font-serif text-[clamp(28px,4.4vw,54px)] font-bold leading-[1.05] tracking-[-0.035em]">
            {article.title}
          </h1>
          <div className="mb-[18px] mt-3.5 font-sans text-[11px] font-bold uppercase tracking-widest text-muted">
            Oleh {article.authorName} · {readMinutes} menit baca
          </div>

          <MediaSlot
            src={article.featuredImageUrl}
            alt={article.title}
            label="No lead image"
            aspectClassName="aspect-video"
          />
          {article.featuredImageUrl && (
            <div className="border-b border-rule py-2 font-sans text-[11px] font-bold uppercase tracking-widest text-muted">
              Foto: Siders Archive
            </div>
          )}
        </div>

        <div className="min-w-0">
          <div className="border-b border-ink pb-2 font-sans text-[11px] font-bold uppercase tracking-widest">
            Share to
          </div>
          <ShareLinks title={article.title} />
          <RelatedArticles categorySlug={article.categories[0]?.slug} excludeId={article.id} />
        </div>
      </div>

      <div
        className="article-body pt-[clamp(18px,2.5vw,28px)] text-[15px] leading-[1.72] [&_p]:mb-4 [&_h2]:mb-2.5 [&_h2]:mt-6 [&_h2]:border-b [&_h2]:border-ink [&_h2]:pb-1.5 [&_h2]:font-serif [&_h2]:text-xl [&_h2]:font-black [&_h2]:uppercase [&_h2]:tracking-wide [&_h3]:mb-2.5 [&_h3]:mt-6 [&_h3]:border-b [&_h3]:border-ink [&_h3]:pb-1.5 [&_h3]:font-serif [&_h3]:text-xl [&_h3]:font-black [&_h3]:uppercase [&_h3]:tracking-wide [&_a]:underline"
        dangerouslySetInnerHTML={{ __html: article.bodyHtml }}
      />

      {/* A Client Component island. `articleId` is the only thing it needs from the server,
          so the route stays ISR — nothing engagement-related is fetched during server
          rendering (specs/web-public-site/spec.md - "The route stays statically
          regenerated"). */}
      <EngagementBar articleId={article.id} />
    </Container>
  );
}
