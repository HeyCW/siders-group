import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { ArticlePublicDetail } from '@siders/contracts';
import { ApiError, getArticleBySlug } from '../lib/api';
import { estimateReadMinutes } from '../lib/readingTime';
import { useDocumentTitle } from '../lib/useDocumentTitle';
import { useMetaDescription } from '../lib/useMetaDescription';
import { useMetaKeywords } from '../lib/useMetaKeywords';
import { splitKeywords } from '../lib/splitKeywords';
import { Container } from '../components/layout/Container';
import { MediaSlot } from '../components/ui/MediaSlot';
import { EngagementBar } from '../components/article/EngagementBar';
import { ShareLinks } from '../components/article/ShareLinks';
import { RelatedArticles } from '../components/article/RelatedArticles';
import { NotFoundPage } from './NotFoundPage';

type LoadState =
  | { status: 'loading' }
  | { status: 'not-found' }
  | { status: 'ready'; article: ArticlePublicDetail };

export function ArticlePage() {
  const { slug } = useParams<{ slug: string }>();
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });
    getArticleBySlug(slug ?? '')
      .then((article) => {
        if (!cancelled) setState({ status: 'ready', article });
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 404) {
          setState({ status: 'not-found' });
          return;
        }
        throw err;
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  useDocumentTitle(
    state.status === 'ready'
      ? `${state.article.seoTitle ?? state.article.title} — Siders`
      : 'Siders',
  );
  useMetaDescription(
    state.status === 'ready'
      ? (state.article.seoDescription ?? state.article.excerpt ?? state.article.title)
      : 'Siders is a hyperlocal media and community platform. Everyone has a voice, everyone has a story, everyone is Siders.',
  );
  useMetaKeywords(state.status === 'ready' ? (state.article.keywords ?? '') : '');

  if (state.status === 'loading') {
    return (
      <Container className="pt-[clamp(20px,3vw,32px)]">
        <div className="py-[clamp(32px,5vw,64px)] font-sans text-[11px] font-bold uppercase tracking-widest text-muted">
          Loading…
        </div>
      </Container>
    );
  }

  if (state.status === 'not-found') {
    return <NotFoundPage />;
  }

  const { article } = state;
  const kicker = article.categories[0]?.name ?? 'Siders';
  const readMinutes = estimateReadMinutes(article.bodyHtml);
  const keywords = splitKeywords(article.keywords);
  const publishedDate = new Date(article.publishedAt).toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  return (
    <Container className="pt-[clamp(20px,3vw,32px)]">
      <Link to="/news" className="font-sans text-[11px] font-bold uppercase tracking-widest">
        ← Back to news
      </Link>

      {/* One grid for the whole article, and the DOM order is the phone's reading order:
          lead image, story, keywords, then the share/related rail last — on a single column
          nothing needs reordering to read that way. From `lg` the placement below lifts the rail
          back up beside the headline and lead image, and the body and keywords span all three
          columns so the prose is never capped at two thirds of the width. */}
      <div className="grid items-start gap-x-[clamp(24px,4vw,56px)] pt-[clamp(20px,3vw,32px)] lg:grid-cols-3">
        <div className="min-w-0 lg:col-span-2 lg:col-start-1 lg:row-start-1">
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

        <div
          className="article-body pt-[clamp(18px,2.5vw,28px)] lg:col-span-3 lg:col-start-1 lg:row-start-2 text-[15px] leading-[1.72] [&_p]:mb-4 [&_h2]:mb-2.5 [&_h2]:mt-6 [&_h2]:border-b [&_h2]:border-ink [&_h2]:pb-1.5 [&_h2]:font-serif [&_h2]:text-xl [&_h2]:font-black [&_h2]:uppercase [&_h2]:tracking-wide [&_h3]:mb-2.5 [&_h3]:mt-6 [&_h3]:border-b [&_h3]:border-ink [&_h3]:pb-1.5 [&_h3]:font-serif [&_h3]:text-xl [&_h3]:font-black [&_h3]:uppercase [&_h3]:tracking-wide [&_a]:underline"
          dangerouslySetInnerHTML={{ __html: article.bodyHtml }}
        />

        {keywords.length > 0 && (
          <div className="pt-[clamp(18px,2.5vw,28px)] lg:col-span-3 lg:col-start-1 lg:row-start-3">
            <div className="border-b border-rule pb-2 font-sans text-[11px] font-bold uppercase tracking-widest text-muted">
              Keywords
            </div>
            <div className="flex flex-wrap gap-2 pt-3">
              {keywords.map((keyword) => (
                <span
                  key={keyword}
                  className="rounded-full border border-rule px-3 py-1 font-sans text-[11px] font-bold uppercase tracking-widest text-muted"
                >
                  {keyword}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Last in the DOM so a phone reads the story before the rail; `lg` puts it back in the
            top-right corner, where its own padding is no longer needed. */}
        <div className="min-w-0 pt-[clamp(24px,4vw,40px)] lg:col-start-3 lg:row-start-1 lg:pt-0">
          <div className="border-b border-ink pb-2 font-sans text-[11px] font-bold uppercase tracking-widest">
            Share to
          </div>
          <ShareLinks title={article.title} />
          <RelatedArticles categorySlug={article.categories[0]?.slug} excludeId={article.id} />
        </div>
      </div>

      {/* A Client Component island under Next; now just a normal component — `articleId` is the
          only thing it needs from the page. */}
      <EngagementBar articleId={article.id} />
    </Container>
  );
}
