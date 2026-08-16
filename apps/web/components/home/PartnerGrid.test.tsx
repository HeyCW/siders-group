import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import type { PublicPartner } from '@siders/contracts';
import { PartnerGrid } from './PartnerGrid.js';

afterEach(cleanup);

const partners: PublicPartner[] = [
  { name: 'Acme Corp', logoUrl: 'https://cdn.example.com/acme.webp', websiteUrl: 'https://acme.example.com' },
  { name: 'Beta Inc', logoUrl: 'https://cdn.example.com/beta.webp', websiteUrl: 'https://beta.example.com' },
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
});
