import type { ArticlePublicCard } from '@siders/contracts';
import { SectionHeading } from '../layout/SectionHeading';
import { ArticleCard } from '../news/ArticleCard';

export function Showcase({ articles }: { articles: ArticlePublicCard[] }) {
  if (articles.length === 0) return null;

  return (
    <div className="pt-[clamp(32px,5vw,64px)]">
      <SectionHeading title="SidersVox — News & Community" trailing="Guide by Siders" />
      <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))]">
        {articles.map((article) => (
          <ArticleCard key={article.id} article={article} />
        ))}
      </div>
    </div>
  );
}
