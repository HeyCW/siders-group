import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { PublicReelItem } from '@siders/contracts';
import { ReelsRail } from './ReelsRail.js';

afterEach(cleanup);

const reels: PublicReelItem[] = [
  {
    provider: 'youtube',
    externalId: 'dQw4w9WgXcQ',
    posterUrl: 'https://cdn.example.com/a.jpg',
    caption: 'First reel',
  },
  {
    provider: 'youtube',
    externalId: 'jNQXAC9IVRw',
    posterUrl: 'https://cdn.example.com/b.jpg',
    caption: 'Second reel',
  },
];

const reelsWithNoPoster: PublicReelItem[] = [
  ...reels,
  { provider: 'youtube', externalId: 'oHg5SJYRHA0', posterUrl: null, caption: 'Third reel' },
];

describe('ReelsRail', () => {
  it('renders no iframe before any activation', () => {
    render(<ReelsRail reels={reels} />);
    expect(document.querySelectorAll('iframe')).toHaveLength(0);
  });

  it('mounts exactly one iframe for the activated reel, and none for the other', () => {
    render(<ReelsRail reels={reels} />);
    fireEvent.click(screen.getByRole('button', { name: /first reel/i }));

    const iframes = document.querySelectorAll('iframe');
    expect(iframes).toHaveLength(1);
    expect(iframes[0]?.src).toContain('dQw4w9WgXcQ');
  });

  it('a second activation replaces the first rather than mounting both', () => {
    render(<ReelsRail reels={reels} />);
    fireEvent.click(screen.getByRole('button', { name: /first reel/i }));
    fireEvent.click(screen.getByRole('button', { name: /close/i }));
    fireEvent.click(screen.getByRole('button', { name: /second reel/i }));

    const iframes = document.querySelectorAll('iframe');
    expect(iframes).toHaveLength(1);
    expect(iframes[0]?.src).toContain('jNQXAC9IVRw');
  });

  it('closing the lightbox unmounts the iframe', () => {
    render(<ReelsRail reels={reels} />);
    fireEvent.click(screen.getByRole('button', { name: /first reel/i }));
    fireEvent.click(screen.getByRole('button', { name: /close/i }));
    expect(document.querySelectorAll('iframe')).toHaveLength(0);
  });

  /** specs/reels-curation/spec.md - "A posterless reel's tile is a live, non-interactive embed". */
  it('renders no image for a reel with no poster, showing a live embed preview instead', () => {
    render(<ReelsRail reels={reelsWithNoPoster} />);

    const tile = screen.getByRole('button', { name: /third reel/i });
    expect(tile.querySelector('img')).toBeNull();
    const previewIframe = tile.querySelector('iframe');
    expect(previewIframe).not.toBeNull();
    expect(previewIframe?.src).toContain('oHg5SJYRHA0');
    expect(tile.textContent).toContain('PLAY');
  });

  it('a poster-bearing reel loads no embed until activated, unaffected by any posterless reel', () => {
    render(<ReelsRail reels={reelsWithNoPoster} />);

    const posterTile = screen.getByRole('button', { name: /first reel/i });
    expect(posterTile.querySelector('iframe')).toBeNull();
  });

  it("a posterless reel's tile embed does not autoplay", () => {
    render(<ReelsRail reels={reelsWithNoPoster} />);

    const tile = screen.getByRole('button', { name: /third reel/i });
    const previewIframe = tile.querySelector('iframe');
    expect(previewIframe?.getAttribute('allow') ?? '').not.toContain('autoplay');
  });

  it('activating a poster-less reel opens the same lightbox as any other reel, not the tile preview', () => {
    render(<ReelsRail reels={reelsWithNoPoster} />);
    fireEvent.click(screen.getByRole('button', { name: /third reel/i }));

    // One iframe is the posterless tile's own always-on preview; the other is the lightbox
    // opened by the click, mounted once activation is triggered by the wrapping button rather
    // than by the (pointer-events-none) preview iframe itself.
    const iframes = [...document.querySelectorAll('iframe')];
    expect(iframes).toHaveLength(2);
    expect(iframes.filter((f) => f.src.includes('oHg5SJYRHA0'))).toHaveLength(2);
    expect(screen.getByRole('button', { name: /close/i })).toBeTruthy();
  });
});
