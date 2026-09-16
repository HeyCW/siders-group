import { Link } from 'react-router-dom';
import { Container } from '../components/layout/Container';
import { JsonLd } from '../components/seo/JsonLd';
import { NotFoundPage } from './NotFoundPage';
import {
  SUB_BRAND_PAGES,
  findSubBrandPage,
  type SubBrandPage as SubBrand,
} from '../lib/subBrandPages';
import { subBrandJsonLd, subBrandUrl } from '../lib/seo';
import { useCanonicalUrl } from '../lib/useCanonicalUrl';
import { useDocumentTitle } from '../lib/useDocumentTitle';
import { useMetaDescription } from '../lib/useMetaDescription';

/**
 * One anak usaha per URL, e.g. `/surabaya-siders`.
 *
 * These exist for search: a page whose `<title>`, `<h1>` and body copy all name one brand is a far
 * stronger relevance signal than the same brand as a tile among others on the home page. That only
 * works if a crawler sees it without running JS, which is why `scripts/prerender.mjs` renders
 * these three routes to static HTML at build time — nothing here may depend on data fetched at
 * runtime, or the prerendered copy would be empty.
 *
 * `Reveal` is deliberately not used. Its initial state is `opacity-0`, which is exactly what a
 * prerendered crawl would capture.
 *
 * Routed by explicit slug (see `App.tsx`) rather than a `:slug` param, so an unknown path still
 * reaches the catch-all 404 instead of this page's own miss branch.
 */
export function SubBrandPageRoute({ slug }: { slug: string }) {
  const page = findSubBrandPage(slug);

  if (!page) return <NotFoundPage />;
  return <SubBrandDetail page={page} />;
}

function SubBrandDetail({ page }: { page: SubBrand }) {
  useDocumentTitle(page.title);
  useMetaDescription(page.metaDescription);
  useCanonicalUrl(subBrandUrl(page.slug));

  const siblings = SUB_BRAND_PAGES.filter((other) => other.slug !== page.slug);

  return (
    <Container className="pt-[clamp(24px,4vw,44px)]">
      <JsonLd data={subBrandJsonLd(page)} />

      <nav
        aria-label="Breadcrumb"
        className="font-sans text-[11px] font-bold uppercase tracking-widest text-muted"
      >
        <Link to="/" className="underline">
          Siders
        </Link>
        <span className="px-1.5">/</span>
        <span>{page.name}</span>
      </nav>

      <header className="mt-3.5 flex flex-wrap items-center gap-x-[clamp(16px,2.5vw,28px)] gap-y-4 border-b-[3px] border-ink pb-[clamp(16px,2.5vw,24px)]">
        <img
          src={`${import.meta.env.BASE_URL}${page.logo}`}
          alt={page.name}
          width={96}
          height={96}
          className="h-[clamp(64px,8vw,96px)] w-[clamp(64px,8vw,96px)] shrink-0 object-contain"
        />
        <div className="min-w-0">
          <h1 className="font-serif text-[clamp(28px,4vw,44px)] font-bold uppercase tracking-[0.02em]">
            {page.name}
          </h1>
          <div className="mt-1.5 font-sans text-[11px] font-bold uppercase tracking-widest text-muted">
            {page.kind}
            {page.city ? ` — ${page.city}` : ''}
            {page.foundingYear ? ` — Sejak ${page.foundingYear}` : ''}
          </div>
        </div>
      </header>

      <p className="mt-[clamp(20px,3vw,32px)] max-w-[62ch] font-serif text-[clamp(17px,2vw,21px)] leading-[1.6]">
        {page.lead}
      </p>

      <section className="mt-[clamp(24px,3.5vw,40px)] border-t border-ink pt-[clamp(20px,3vw,32px)]">
        <h2 className="font-sans text-[11px] font-bold uppercase tracking-widest text-muted">
          Ikuti {page.name}
        </h2>
        <div className="mt-2.5 flex flex-wrap gap-x-[clamp(16px,2.5vw,28px)] gap-y-2.5">
          {page.socials.map((social) => (
            <a
              key={social.href}
              href={social.href}
              target="_blank"
              rel="noopener noreferrer me"
              className="border-b-2 border-ink pb-0.5 font-sans text-[11px] font-bold uppercase tracking-widest transition-colors duration-hover ease-hover hover:bg-signal"
            >
              {social.label} {social.handle} ↗︎
            </a>
          ))}
        </div>
      </section>

      <section className="mt-[clamp(24px,3.5vw,40px)] border-t border-ink pt-[clamp(20px,3vw,32px)]">
        <h2 className="font-sans text-[11px] font-bold uppercase tracking-widest text-muted">
          Anak usaha lain
        </h2>
        <div className="flex flex-col">
          {siblings.map((sibling) => (
            <Link
              key={sibling.slug}
              to={`/${sibling.slug}`}
              className="group flex items-baseline justify-between gap-3 border-b border-rule py-2.5 transition-[border-bottom-width,border-color] duration-hover ease-hover hover:border-b-[3px] hover:border-ink focus-visible:border-b-[3px] focus-visible:border-ink"
            >
              <span className="font-serif text-[clamp(16px,1.8vw,19px)] font-bold tracking-[-0.02em]">
                {sibling.name}
              </span>
              <span className="font-sans text-[11px] font-bold uppercase tracking-widest text-muted">
                {sibling.kind} ↗︎
              </span>
            </Link>
          ))}
        </div>
      </section>

      <div className="h-[clamp(24px,4vw,40px)]" />
    </Container>
  );
}
