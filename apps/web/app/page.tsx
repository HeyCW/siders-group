import { getAnakUsahaList, getGuidePicks, getHomeFeed, getPartners } from '../lib/api';
import { presentedAnakUsaha } from '../lib/anakUsaha';
import { Container } from '../components/layout/Container';
import { Hero } from '../components/home/Hero';
import { IntroBlurb } from '../components/home/IntroBlurb';
import { StatsBand } from '../components/home/StatsBand';
import { ConnectedPlatforms } from '../components/home/ConnectedPlatforms';
import { GuideOfWeek } from '../components/home/GuideOfWeek';
import { Showcase } from '../components/home/Showcase';
import { AnakUsahaTiles } from '../components/home/AnakUsahaTiles';
import { PartnerGrid } from '../components/home/PartnerGrid';
import { CtaBand } from '../components/home/CtaBand';

export const revalidate = 60;

export default async function HomePage() {
  const [articles, partners, guides, anakUsahaList] = await Promise.all([
    getHomeFeed(3, { next: { revalidate: 60 } }),
    // The partner strip is the one section on this page with a defined empty state — it renders
    // nothing at all when the list is empty (specs/web-public-site/spec.md - "No partners means no
    // section"). So a failing `/partners` degrades to a hidden section instead of taking the
    // articles down with it through `Promise.all`; there is no `error.tsx` here to catch it
    // otherwise.
    getPartners({ next: { revalidate: 60 } }).catch(() => []),
    // Same treatment as partners: a failed or empty guide-picks fetch hides the section rather
    // than failing the whole home page (specs/web-public-site/spec.md - "No guide picks means no
    // section"; design.md - "Zero-pick hiding").
    getGuidePicks({ next: { revalidate: 60 } }).catch(() => []),
    // Same treatment again — a failed anak usaha fetch hides both this page's sections that
    // depend on it rather than failing the whole home page. Request-memoized against
    // `layout.tsx`'s identical call within this same request, so this is not a second network
    // round trip.
    getAnakUsahaList({ next: { revalidate: 60 } }).catch(() => []),
  ]);
  const anakUsahaBrands = presentedAnakUsaha(anakUsahaList);

  return (
    <div>
      <Container>
        <Hero />
        <IntroBlurb />
        <div className="h-[clamp(28px,4vw,48px)]" />
      </Container>

      <StatsBand />

      <Container>
        <ConnectedPlatforms />
      </Container>

      <Container>
        <GuideOfWeek guides={guides} />
      </Container>
      <Container>
        <Showcase articles={articles} />
      </Container>
      <Container>
        <AnakUsahaTiles brands={anakUsahaBrands} />
        <PartnerGrid partners={partners} />
        <CtaBand />
      </Container>
    </div>
  );
}
