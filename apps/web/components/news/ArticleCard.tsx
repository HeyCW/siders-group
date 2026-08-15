import Link from 'next/link';
import type { ArticlePublicCard } from '@siders/contracts';

function formatMeta(article: ArticlePublicCard): string {
  const cats = article.categories.map((c) => c.name).join(', ');
  const date = new Date(article.publishedAt).toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  return cats ? `${cats} · ${date}` : date;
}

export function ArticleCard({
  article,
  featured = false,
}: {
  article: ArticlePublicCard;
  featured?: boolean;
}) {
  if (featured) {
    return (
      <Link
        href={`/news/${article.slug}`}
        className="group grid grid-cols-[repeat(auto-fit,minmax(300px,1fr))] gap-[clamp(20px,3vw,32px)] border-b border-ink py-[clamp(20px,3vw,32px)] transition-[border-bottom-width] duration-hover ease-hover hover:border-b-[5px] focus-visible:border-b-[5px]"
      >
        <span className="block aspect-[4/3] w-full bg-ink" />
        <span className="block">
          <span className="block font-sans text-[11px] font-bold uppercase tracking-widest text-muted">
            Featured · {formatMeta(article)}
          </span>
          <span className="my-2.5 block">
            <span className="mark-group font-serif text-[clamp(26px,3.4vw,40px)] font-bold leading-[1.08] tracking-[-0.03em]">
              {article.title}
            </span>
          </span>
          {article.excerpt && (
            <span className="block max-w-[52ch] text-[13px] leading-[1.65] text-muted">
              {article.excerpt}
            </span>
          )}
        </span>
      </Link>
    );
  }

  return (
    <Link
      href={`/news/${article.slug}`}
      className="group block border-b border-rule border-r border-r-rule-strong px-[clamp(14px,2vw,28px)] py-[clamp(18px,2.4vw,26px)] transition-[border-bottom-width,border-color] duration-hover ease-hover hover:border-b-[3px] hover:border-b-ink focus-visible:border-b-[3px] focus-visible:border-b-ink"
    >
      <span className="block aspect-[3/2] w-full bg-ink" />
      <span className="my-1.5 block font-sans text-[11px] font-bold uppercase tracking-widest text-muted">
        {formatMeta(article)}
      </span>
      <span className="mark-group font-serif text-[19px] font-bold leading-[1.18] tracking-[-0.015em]">
        {article.title}
      </span>
      {article.excerpt && (
        <span className="mt-2 block text-[13px] leading-[1.65] text-muted">{article.excerpt}</span>
      )}
    </Link>
  );
}
