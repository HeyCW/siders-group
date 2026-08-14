import { getHomeFeed, getReels } from '../lib/api';
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
  const [articles, reels] = await Promise.all([
    getHomeFeed(3, { next: { revalidate: 60 } }),
    getReels({ next: { revalidate: 60 } }),
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
        <PartnerGrid />
        <CtaBand />
      </Container>
    </div>
  );
}
