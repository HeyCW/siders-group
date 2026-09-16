import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { NavLinks } from './NavLinks.js';

afterEach(cleanup);

/** The active item is the one painted with the signal fill; every other item renders the
 *  transparent hover-underline variant instead. */
function activeLabel(): string | undefined {
  return (
    screen.getAllByRole('link').find((link) => !link.className.includes('bg-transparent'))
      ?.textContent ?? undefined
  );
}

function renderAt(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <NavLinks />
    </MemoryRouter>,
  );
}

describe('NavLinks', () => {
  it('marks Home active on the home page only among top-level items', () => {
    renderAt('/');
    expect(activeLabel()).toBe('Home');
  });

  it('marks the section active on its own page', () => {
    renderAt('/news');
    expect(activeLabel()).toBe('Hyperlocal News');
  });

  it('keeps the section active on a page nested under it', () => {
    renderAt('/news/some-article');
    expect(activeLabel()).toBe('Hyperlocal News');
  });

  /** Anak usaha pages have no nav item of their own — without this the nav goes blank. */
  it('keeps Home active on an anak usaha page', () => {
    renderAt('/surabaya-siders');
    expect(activeLabel()).toBe('Home');
  });

  it('keeps Home active on the trailing-slash form the server redirects to', () => {
    renderAt('/jakarta-siders/');
    expect(activeLabel()).toBe('Home');
  });

  it('marks nothing active on an unknown page', () => {
    renderAt('/nope');
    expect(activeLabel()).toBeUndefined();
  });
});
