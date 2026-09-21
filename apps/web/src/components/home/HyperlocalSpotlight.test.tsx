import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { ArticlePublicCard } from '@siders/contracts';
import { HyperlocalSpotlight } from './HyperlocalSpotlight.js';

afterEach(cleanup);

const article: ArticlePublicCard = {
  id: '11111111-1111-1111-1111-111111111111',
  slug: 'a-hyperlocal-story',
  title: 'A Hyperlocal Story',
  excerpt: 'What happened nearby.',
  featuredImageUrl: null,
  categories: [],
  anakUsaha: null,
  authorName: 'Jane Reporter',
  publishedAt: '2026-01-01T00:00:00.000Z',
};

function renderWithRouter(node: React.ReactElement) {
  return render(<MemoryRouter>{node}</MemoryRouter>);
}

describe('HyperlocalSpotlight', () => {
  /** specs/hyperlocal-spotlight/spec.md - "Nothing to render renders nothing". */
  it('renders nothing when there is no article', () => {
    const { container } = renderWithRouter(<HyperlocalSpotlight article={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  /** specs/hyperlocal-spotlight/spec.md - "Editor pick renders" / "Fallback renders
   *  identically" — the component receives only the resolved article and renders it the same
   *  way regardless of where it came from. */
  it('renders the resolved article', () => {
    renderWithRouter(<HyperlocalSpotlight article={article} />);

    expect(screen.getByText('A Hyperlocal Story')).toBeTruthy();
    expect(screen.getByText('What happened nearby.')).toBeTruthy();
    expect(screen.getByRole('link')).toHaveAttribute('href', '/news/a-hyperlocal-story');
  });
});
