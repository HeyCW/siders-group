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
});
