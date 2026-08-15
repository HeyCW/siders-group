import Link from 'next/link';
import { getArticles } from '../../lib/api';

/**
 * Real category overlap, not the prototype's hardcoded sample list — omitted entirely when the
 * article has no category rather than falling back to an unrelated list
 * (`design.md` — "Article detail: related rail from real category overlap").
 */
export async function RelatedArticles({
  categorySlug,
  excludeId,
}: {
  categorySlug: string | undefined;
  excludeId: string;
}) {
  if (!categorySlug) return null;

  const related = await getArticles(
    { categorySlug, excludeIds: [excludeId], limit: 5 },
    { next: { revalidate: 60 } },
  );
  if (related.length === 0) return null;

  return (
    <div>
      <div className="border-b border-ink pb-2 font-sans text-[11px] font-bold uppercase tracking-widest">
        Related
      </div>
      {related.map((article) => (
        <Link
          key={article.id}
          href={`/news/${article.slug}`}
          className="group grid grid-cols-[64px_1fr] items-start gap-3 border-b border-rule py-3.5 transition-[border-bottom-width,border-color] duration-hover ease-hover hover:border-b-[3px] hover:border-ink focus-visible:border-b-[3px] focus-visible:border-ink"
        >
          <span className="block aspect-square w-16 bg-ink" />
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
