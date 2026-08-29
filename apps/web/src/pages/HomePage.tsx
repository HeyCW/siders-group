import { useEffect, useState } from 'react';
import type { ArticlePublicCard, PublicGuidePick, PublicPartner } from '@siders/contracts';
import { getGuidePicks, getHomeFeed, getPartners } from '../lib/api';
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
import { presentedAnakUsaha } from '../lib/anakUsaha';
import { getAnakUsahaList } from '../lib/api';
import { useDocumentTitle } from '../lib/useDocumentTitle';

export function HomePage() {
  useDocumentTitle('Siders');

  const [articles, setArticles] = useState<ArticlePublicCard[]>([]);
  const [partners, setPartners] = useState<PublicPartner[]>([]);
  const [guides, setGuides] = useState<PublicGuidePick[]>([]);
  const [anakUsahaBrands, setAnakUsahaBrands] = useState(presentedAnakUsaha([]));

  useEffect(() => {
    let cancelled = false;

    // Unlike the three fetches below, `getHomeFeed` had no defined empty state under Next (a
    // failure there failed the whole Server Component render); there is no error boundary here
    // to reproduce that with, so it degrades the same way the others do — an empty showcase
    // rather than an unhandled rejection.
    getHomeFeed(3)
      .then((result) => {
        if (!cancelled) setArticles(result);
      })
      .catch(() => {
        if (!cancelled) setArticles([]);
      });
    // The partner strip is the one section on this page with a defined empty state — it renders
    // nothing at all when the list is empty (specs/web-public-site/spec.md - "No partners means no
    // section"). So a failing `/partners` degrades to a hidden section instead of taking the rest
    // of the page down with it.
    getPartners()
      .then((result) => {
        if (!cancelled) setPartners(result);
      })
      .catch(() => {
        if (!cancelled) setPartners([]);
      });
    // Same treatment as partners: a failed or empty guide-picks fetch hides the section rather
    // than failing the whole home page (specs/web-public-site/spec.md - "No guide picks means no
    // section"; design.md - "Zero-pick hiding").
    getGuidePicks()
      .then((result) => {
        if (!cancelled) setGuides(result);
      })
      .catch(() => {
        if (!cancelled) setGuides([]);
      });
    getAnakUsahaList()
      .then((result) => {
        if (!cancelled) setAnakUsahaBrands(presentedAnakUsaha(result));
      })
      .catch(() => {
        if (!cancelled) setAnakUsahaBrands(presentedAnakUsaha([]));
      });

    return () => {
      cancelled = true;
    };
  }, []);

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
