import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { PublicPartner } from '@siders/contracts';
import { PartnerGrid } from './PartnerGrid.js';

afterEach(cleanup);

const partners: PublicPartner[] = [
  { name: 'Acme Corp', logoUrl: 'https://cdn.example.com/acme.webp', websiteUrl: 'https://acme.example.com' },
  { name: 'Beta Inc', logoUrl: 'https://cdn.example.com/beta.webp', websiteUrl: 'https://beta.example.com' },
];

/** Acme has a website, Gamma does not — used to assert the two render differently. */
const mixedPartners: PublicPartner[] = [
  { name: 'Acme Corp', logoUrl: 'https://cdn.example.com/acme.webp', websiteUrl: 'https://acme.example.com' },
  { name: 'Gamma LLC', logoUrl: 'https://cdn.example.com/gamma.webp', websiteUrl: null },
];

describe('PartnerGrid', () => {
  /** specs/web-public-site/spec.md - "No partners means no section". */
  it('renders nothing when there are no partners', () => {
    const { container } = render(<PartnerGrid partners={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  /** specs/web-public-site/spec.md - "Partners come from the backend". */
  it('renders every partner with no placeholder content', () => {
    render(<PartnerGrid partners={partners} />);

    expect(screen.getAllByAltText('Acme Corp').length).toBeGreaterThan(0);
    expect(screen.getAllByAltText('Beta Inc').length).toBeGreaterThan(0);
    expect(screen.queryByText('Brand')).not.toBeInTheDocument();
  });

  /** specs/web-public-site/spec.md - "Each partner is reachable exactly once by keyboard and
   *  screen reader". */
  it('marks every looped copy beyond the first as aria-hidden and unreachable by tab, keeping exactly one reachable link per partner', () => {
    render(<PartnerGrid partners={partners} />);

    const ticker = screen.getByTestId('partner-ticker');
    const links = within(ticker).getAllByRole('link', { hidden: true });

    // Total tiles rendered = one full doubled track; well more than 2 per partner given the
    // min-width padding, so this asserts the padding/looping actually happened.
    expect(links.length).toBeGreaterThan(partners.length * 2);

    const reachable = links.filter((link) => link.getAttribute('aria-hidden') !== 'true');
    const reachableNames = reachable.map((link) => link.querySelector('img')?.alt);
    expect(reachableNames).toEqual(['Acme Corp', 'Beta Inc']);

    const hidden = links.filter((link) => link.getAttribute('aria-hidden') === 'true');
    expect(hidden.length).toBe(links.length - partners.length);
    for (const link of hidden) {
      expect(link).toHaveAttribute('tabindex', '-1');
    }
    for (const link of reachable) {
      expect(link).not.toHaveAttribute('tabindex');
    }
  });

  /** specs/web-public-site/spec.md - "Reduced motion shows all partners without scrolling". The
   *  static grid is a separate render path (`motion-reduce:block`, no `animate-marquee`), not the
   *  ticker's duplicated track — verified structurally, since jsdom does not evaluate
   *  `prefers-reduced-motion` media queries. */
  it('renders a separate reduced-motion grid containing every partner exactly once, with no ticker markup', () => {
    render(<PartnerGrid partners={partners} />);

    const staticGrid = screen.getByTestId('partner-static-grid');
    const images = within(staticGrid).getAllByRole('img');
    expect(images.map((img) => img.getAttribute('alt'))).toEqual(['Acme Corp', 'Beta Inc']);
    expect(staticGrid.querySelector('.animate-marquee')).toBeNull();
    expect(staticGrid.className).toContain('motion-reduce:block');
  });

  /**
   * The scroll never pauses for a pointer hover (specs/web-public-site/spec.md - "The ticker
   * pauses only for keyboard interaction") — only keyboard focus clears it, so a tabbed-to link
   * doesn't ride offscreen mid-scroll. With `focus-within` merely pausing, a link tabbed to
   * mid-cycle measured 0 of 160px visible inside the `overflow-hidden` clip in Chromium — a
   * transform does not move scroll position, so nothing recovered it. Scoped to `:focus-visible`
   * (via `has-[:focus-visible]`) rather than plain `:focus-within`, so a mouse click on a partner
   * link — which also focuses it — doesn't trigger the same backward snap; only a keyboard Tab
   * does. jsdom cannot evaluate `:focus-visible`, so this asserts the class contract that produces
   * it; the behaviour itself is verified in a real browser.
   */
  it('never pauses for hover and has no `:hover` class, but clears the animation on keyboard focus so a focused tile returns to view', () => {
    render(<PartnerGrid partners={partners} />);

    const track = screen.getByTestId('partner-ticker').firstElementChild as HTMLElement;

    expect(track.className).not.toMatch(/hover:/);
    expect(track.style.animationPlayState).toBe('');
    fireEvent.mouseEnter(track);
    expect(track.style.animationPlayState).toBe('');

    expect(track.className).toContain('has-[:focus-visible]:[animation:none]');
    expect(track.className).not.toContain('focus-within:[animation:none]');
    expect(track.className).not.toContain('has-[:focus-visible]:[animation-play-state:paused]');
  });

  /** The reduced-motion branch renders from the same `PartnerTile` as the ticker, so a reader who
   *  prefers reduced motion still gets click-through to each partner's site — one reachable link
   *  per partner, none of them `aria-hidden` duplicates. */
  it('gives the reduced-motion grid one reachable link per partner, matching the ticker', () => {
    render(<PartnerGrid partners={partners} />);

    const staticGrid = screen.getByTestId('partner-static-grid');
    const links = within(staticGrid).getAllByRole('link', { hidden: true });

    expect(links).toHaveLength(partners.length);
    expect(links.map((link) => link.getAttribute('href'))).toEqual(partners.map((p) => p.websiteUrl));
    for (const link of links) {
      expect(link).not.toHaveAttribute('aria-hidden');
      expect(link).not.toHaveAttribute('tabindex');
    }
  });

  /** specs/web-public-site/spec.md - "A partner with no website URL renders without a link". */
  it('renders a partner with no website URL as a non-interactive tile, not a link', () => {
    render(<PartnerGrid partners={mixedPartners} />);

    const ticker = screen.getByTestId('partner-ticker');
    const links = within(ticker).getAllByRole('link', { hidden: true });
    const linkedNames = links.map((link) => link.querySelector('img')?.alt);

    expect(linkedNames).not.toContain('Gamma LLC');
    expect(linkedNames).toContain('Acme Corp');
    // The logo itself still renders — only the link wrapper is absent.
    expect(within(ticker).getAllByAltText('Gamma LLC').length).toBeGreaterThan(0);
  });

  it('leaves a partner with a website URL as a link when other partners have none', () => {
    render(<PartnerGrid partners={mixedPartners} />);

    const ticker = screen.getByTestId('partner-ticker');
    const links = within(ticker).getAllByRole('link', { hidden: true });
    const reachable = links.filter((link) => link.getAttribute('aria-hidden') !== 'true');

    expect(reachable.map((link) => link.querySelector('img')?.alt)).toEqual(['Acme Corp']);
    expect(reachable[0]).toHaveAttribute('href', 'https://acme.example.com');
  });

  it('excludes a linkless partner from the reduced-motion grid\'s reachable links, keeping the linked one', () => {
    render(<PartnerGrid partners={mixedPartners} />);

    const staticGrid = screen.getByTestId('partner-static-grid');
    const links = within(staticGrid).getAllByRole('link', { hidden: true });

    expect(links).toHaveLength(1);
    expect(links[0]?.querySelector('img')?.alt).toBe('Acme Corp');
    expect(within(staticGrid).getAllByAltText('Gamma LLC').length).toBeGreaterThan(0);
  });
});
