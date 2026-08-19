import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { PublicGuidePick } from '@siders/contracts';
import { GuideOfWeek } from './GuideOfWeek.js';

afterEach(cleanup);

function pick(overrides: Partial<PublicGuidePick> & Pick<PublicGuidePick, 'place'>): PublicGuidePick {
  return {
    city: 'Surabaya',
    description: 'Wifi kuat dan buka sampai tengah malam.',
    photoUrl: 'https://cdn.example.com/seven-cafe.webp',
    ...overrides,
  };
}

describe('GuideOfWeek', () => {
  /** specs/web-public-site/spec.md - "No guide picks means no section". */
  it('renders nothing when there are no guide picks', () => {
    const { container } = render(<GuideOfWeek guides={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  /** specs/web-public-site/spec.md - "Guide picks come from the backend". */
  it('renders every active pick with no placeholder content', () => {
    const guides = [pick({ place: 'Seven Cafe' }), pick({ place: 'Playground, Blok M', city: 'Jakarta' })];
    render(<GuideOfWeek guides={guides} />);

    expect(screen.getByText('Seven Cafe')).toBeTruthy();
    expect(screen.getByText('Playground, Blok M')).toBeTruthy();
    expect(screen.queryByText(/Drop .* guide photo/i)).not.toBeInTheDocument();
    expect(screen.getAllByRole('img')).toHaveLength(2);
  });

  /** specs/web-public-site/spec.md - "A single pick renders without a dangling divider". Asserted
   *  structurally: every cell shares the exact same border/padding classes regardless of count or
   *  position, so there is no index-dependent styling that could leave a lone pick half-bordered. */
  it('gives a single pick the same bordered-card treatment as any other count', () => {
    render(<GuideOfWeek guides={[pick({ place: 'Seven Cafe' })]} />);

    const card = screen.getByText('Seven Cafe').closest('div')!.parentElement as HTMLElement;
    expect(card.className).toContain('border-b');
    expect(card.className).toContain('border-r');
    expect(card.className).toContain('border-rule');
  });

  /** specs/web-public-site/spec.md - "More picks than fit one row wrap without a missing
   *  divider". With enough picks to wrap, every cell — first row or not — must carry the identical
   *  border treatment; there is no per-index class in the implementation to diverge. */
  it('gives every pick the same border treatment when enough picks exist to wrap onto a second row', () => {
    const many = Array.from({ length: 6 }, (_, i) => pick({ place: `Place ${i}` }));
    render(<GuideOfWeek guides={many} />);

    const cards = many.map((g) => screen.getByText(g.place).closest('div')!.parentElement as HTMLElement);
    const classSets = cards.map((card) => card.className);
    expect(new Set(classSets).size).toBe(1);
    for (const className of classSets) {
      expect(className).toContain('border-b');
      expect(className).toContain('border-r');
    }
  });
});
