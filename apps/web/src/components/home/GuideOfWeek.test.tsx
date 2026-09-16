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
    videoUrl: 'https://cdn.example.com/seven-cafe.mp4',
    instagramUrl: null,
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
  });

  /** specs/web-public-site/spec.md - "Picks are grouped by city" / "Group order follows first
   *  appearance in the editorial order". */
  it('groups picks under one labeled heading per city, in first-appearance order', () => {
    const guides = [
      pick({ place: 'Blok M', city: 'Jakarta' }),
      pick({ place: 'Seven Cafe', city: 'Surabaya' }),
      pick({ place: 'Braga Street', city: 'Jakarta' }),
    ];
    render(<GuideOfWeek guides={guides} />);

    const headings = screen.getAllByText(/^(Jakarta|Surabaya)$/);
    expect(headings.map((h) => h.textContent)).toEqual(['Jakarta', 'Surabaya']);
  });

  /** specs/web-public-site/spec.md - "A single active city renders one group". */
  it('renders exactly one group when every pick shares the same city', () => {
    const guides = [pick({ place: 'Seven Cafe' }), pick({ place: 'Taman Bungkul' })];
    render(<GuideOfWeek guides={guides} />);

    expect(screen.getAllByText('Surabaya')).toHaveLength(1);
  });

  it('renders each pick as a video that does not preload and has no poster', () => {
    const guides = [pick({ place: 'Seven Cafe' })];
    const { container } = render(<GuideOfWeek guides={guides} />);

    const video = container.querySelector('video') as HTMLVideoElement;
    expect(video).toBeTruthy();
    expect(video.getAttribute('poster')).toBeNull();
    expect(video.getAttribute('src')).toBe('https://cdn.example.com/seven-cafe.mp4');
    expect(video.getAttribute('preload')).toBe('none');
  });

  /** specs/guide-of-the-week-management/spec.md - "A guide pick's Instagram link takes over its
   *  public card": the video still autoplays as a muted preview (same as any other card), but the
   *  card is a link and the video carries no native `controls` — a click must navigate, not toggle
   *  play/pause. */
  it('renders a pick with an Instagram URL as a link wrapping its still-present preview video', () => {
    const guides = [pick({ place: 'Seven Cafe', instagramUrl: 'https://instagram.com/p/abc123' })];
    const { container } = render(<GuideOfWeek guides={guides} />);

    const link = screen.getByRole('link', { name: /Seven Cafe/ });
    expect(link.getAttribute('href')).toBe('https://instagram.com/p/abc123');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');

    const video = link.querySelector('video') as HTMLVideoElement;
    expect(video).toBeTruthy();
    expect(video.hasAttribute('controls')).toBe(false);
    expect(container.querySelectorAll('video')).toHaveLength(1);
  });

  it('renders a pick without an Instagram URL exactly as before: an inline video with controls, no link', () => {
    const guides = [pick({ place: 'Seven Cafe', instagramUrl: null })];
    const { container } = render(<GuideOfWeek guides={guides} />);

    const video = container.querySelector('video') as HTMLVideoElement;
    expect(video).toBeTruthy();
    expect(video.hasAttribute('controls')).toBe(true);
    expect(screen.queryByRole('link')).toBeNull();
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
