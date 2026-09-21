import type { ArticlePublicCard } from '@siders/contracts';
import { SectionHeading } from '../layout/SectionHeading';
import { ArticleCard } from '../news/ArticleCard';
import { Reveal } from '../ui/Reveal';

/**
 * The hyperlocal spotlight: the single article the newsroom's editor pick currently resolves to
 * — an explicit pick when one is publicly visible, otherwise the most recently published article
 * (specs/hyperlocal-spotlight/spec.md - "The public home page renders the resolved spotlight").
 * `article` is already fully resolved by the API; this component does not know or care whether
 * it came from an editor pick or the automatic fallback — both render identically.
 *
 * Renders nothing at all when there is no article to show, the same "no section, no
 * placeholder" treatment `GuideOfWeek` and `PartnerGrid` give their own empty states — this
 * happens only when the site has no publicly visible article at all, or the read failed.
 */
export function HyperlocalSpotlight({ article }: { article: ArticlePublicCard | null }) {
  if (!article) return null;

  return (
    <div className="pt-[clamp(32px,5vw,64px)]">
      <SectionHeading title="Hyperlocal Spotlight" />
      <Reveal delayMs={90}>
        <ArticleCard article={article} featured />
      </Reveal>
    </div>
  );
}
