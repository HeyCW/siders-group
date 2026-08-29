import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { ArticlePublicCard } from '@siders/contracts';
import { getArticles } from '../../lib/api';
import { MediaSlot } from '../ui/MediaSlot';

/**
 * Real category overlap, not the prototype's hardcoded sample list — omitted entirely when the
 * article has no category rather than falling back to an unrelated list
 * (`design.md` — "Article detail: related rail from real category overlap").
 *
 * A plain client-fetching component rather than an async Server Component (making-csr: there is
 * no server render left to do the fetch during).
 */
export function RelatedArticles({
  categorySlug,
  excludeId,
}: {
  categorySlug: string | undefined;
  excludeId: string;
}) {
  const [related, setRelated] = useState<ArticlePublicCard[]>([]);

  useEffect(() => {
    if (!categorySlug) {
      setRelated([]);
      return;
    }
    let cancelled = false;
    getArticles({ categorySlugs: [categorySlug], excludeIds: [excludeId], limit: 5 })
      .then((result) => {
        if (!cancelled) setRelated(result);
      })
      .catch(() => {
        if (!cancelled) setRelated([]);
      });
    return () => {
      cancelled = true;
    };
  }, [categorySlug, excludeId]);

  if (!categorySlug || related.length === 0) return null;

  return (
    <div>
      <div className="border-b border-ink pb-2 font-sans text-[11px] font-bold uppercase tracking-widest">
        Related
      </div>
      {related.map((article) => (
        <Link
          key={article.id}
          to={`/news/${article.slug}`}
          className="group grid grid-cols-[64px_1fr] items-start gap-3 border-b border-rule py-3.5 transition-[border-bottom-width,border-color] duration-hover ease-hover hover:border-b-[3px] hover:border-ink focus-visible:border-b-[3px] focus-visible:border-ink"
        >
          <MediaSlot
            src={article.featuredImageUrl}
            alt={article.title}
            label="No image"
            aspectClassName="aspect-square"
            className="w-16"
          />
          <span className="block">
            <span className="mark-group font-serif text-sm font-bold leading-tight">
              {article.title}
            </span>
            <span className="mt-1.5 block font-sans text-[11px] font-bold uppercase tracking-widest text-muted">
              {article.categories[0]?.name ?? ''}
            </span>
          </span>
        </Link>
      ))}
    </div>
  );
}
