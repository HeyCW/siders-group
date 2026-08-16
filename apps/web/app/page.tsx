import { getHomeFeed, getPartners, getReels } from '../lib/api';
import { Container } from '../components/layout/Container';
import { Hero } from '../components/home/Hero';
import { IntroBlurb } from '../components/home/IntroBlurb';
import { StatsBand } from '../components/home/StatsBand';
import { GuideOfWeek } from '../components/home/GuideOfWeek';
import { Showcase } from '../components/home/Showcase';
import { ReelsRail } from '../components/home/ReelsRail';
import { AnakUsahaTiles } from '../components/home/AnakUsahaTiles';
import { PartnerGrid } from '../components/home/PartnerGrid';
import { CtaBand } from '../components/home/CtaBand';

export const revalidate = 60;

export default async function HomePage() {
  const [articles, reels, partners] = await Promise.all([
    getHomeFeed(3, { next: { revalidate: 60 } }),
    getReels({ next: { revalidate: 60 } }),
    // The partner strip is the one section on this page with a defined empty state — it renders
    // nothing at all when the list is empty (specs/web-public-site/spec.md - "No partners means no
    // section"). So a failing `/partners` degrades to a hidden section instead of taking the
    // articles and reels down with it through `Promise.all`; there is no `error.tsx` here to catch
    // it otherwise.
    getPartners({ next: { revalidate: 60 } }).catch(() => []),
  ]);

  return (
    <div>
      <Container>
        <Hero />
        <IntroBlurb />
        <div className="h-[clamp(28px,4vw,48px)]" />
      </Container>

      <StatsBand />

      <Container>
        <GuideOfWeek />
      </Container>
      <Container>
        <Showcase articles={articles} />
      </Container>
      <Container>
        <ReelsRail reels={reels} />
      </Container>
      <Container>
        <AnakUsahaTiles />
        <PartnerGrid partners={partners} />
        <CtaBand />
      </Container>
    </div>
  );
}
