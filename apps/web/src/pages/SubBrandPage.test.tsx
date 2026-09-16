import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { hydrateRoot } from 'react-dom/client';
import { act } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { StaticRouter } from 'react-router-dom/server';
import { SubBrandPageRoute } from './SubBrandPage.js';
import { SUB_BRAND_PAGES } from '../lib/subBrandPages.js';

afterEach(cleanup);

const surabaya = SUB_BRAND_PAGES.find((page) => page.slug === 'surabaya-siders')!;

/**
 * Where `apps/web/index.html` lives, whichever directory Vitest was started from — `pnpm test` at
 * the workspace root and `vitest` inside this app give different `cwd` values, and `import.meta`
 * is no help because the test is transformed and its module URL is not a file: URL.
 */
function webRoot(): string {
  const cwd = process.cwd();
  return existsSync(resolve(cwd, 'index.html')) ? cwd : resolve(cwd, 'apps/web');
}

function readJsonLd(container: HTMLElement): Record<string, unknown>[] {
  const script = container.querySelector('script[type="application/ld+json"]');
  expect(script).not.toBeNull();
  return JSON.parse(script!.textContent!)['@graph'];
}

describe('SubBrandPageRoute', () => {
  it('renders the brand name as the only h1', () => {
    const { container } = render(
      <MemoryRouter>
        <SubBrandPageRoute slug="surabaya-siders" />
      </MemoryRouter>,
    );

    const headings = container.querySelectorAll('h1');
    expect(headings).toHaveLength(1);
    expect(headings[0]?.textContent).toBe('Surabaya Siders');
  });

  it('opens with the explicit definition sentence', () => {
    render(
      <MemoryRouter>
        <SubBrandPageRoute slug="surabaya-siders" />
      </MemoryRouter>,
    );

    expect(screen.getByText(surabaya.lead)).toBeInTheDocument();
  });

  it('falls back to the not-found page for an unknown slug', () => {
    const { container } = render(
      <MemoryRouter>
        <SubBrandPageRoute slug="not-a-brand" />
      </MemoryRouter>,
    );

    expect(container.querySelector('h1')?.textContent).toBe('Not found');
  });

  it('links to the other anak usaha but not to itself', () => {
    render(
      <MemoryRouter>
        <SubBrandPageRoute slug="surabaya-siders" />
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: /Jakarta Siders/ })).toHaveAttribute(
      'href',
      '/jakarta-siders',
    );
    expect(screen.queryByRole('link', { name: /^Surabaya Siders$/ })).not.toBeInTheDocument();
  });

  describe('structured data', () => {
    it('points sameAs at this brand alone and parentOrganization at the group', () => {
      const { container } = render(
        <MemoryRouter>
          <SubBrandPageRoute slug="surabaya-siders" />
        </MemoryRouter>,
      );

      const organization = readJsonLd(container).find((node) => node['@type'] === 'Organization')!;

      expect(organization['@id']).toBe('https://sidersmedia.com/siders/#surabaya-siders');
      expect(organization.sameAs).toEqual([
        'https://www.instagram.com/surabayasiders',
        'https://www.tiktok.com/@surabaya.siders',
      ]);
      expect(organization.parentOrganization).toEqual({
        '@id': 'https://sidersmedia.com/siders/#organization',
      });
    });

    /** The whole point of the split: the node id here has to be the one the home page's
     *  `subOrganization` list already references, or Google sees two unrelated entities. */
    it('uses an @id the home page already references', () => {
      const indexHtml = readFileSync(resolve(webRoot(), 'index.html'), 'utf8');
      const homeGraph = JSON.parse(
        indexHtml.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)![1]!,
      )['@graph'];
      const referenced = homeGraph
        .find((node: Record<string, unknown>) => node['@type'] === 'Organization')
        .subOrganization.map((ref: { '@id': string }) => ref['@id']);

      for (const page of SUB_BRAND_PAGES) {
        expect(referenced).toContain(`https://sidersmedia.com/siders/#${page.slug}`);
      }
    });

    it('omits foundingDate until a real year is supplied', () => {
      const { container } = render(
        <MemoryRouter>
          <SubBrandPageRoute slug="surabaya-siders" />
        </MemoryRouter>,
      );

      const organization = readJsonLd(container).find((node) => node['@type'] === 'Organization')!;
      expect(organization).not.toHaveProperty('foundingDate');
    });
  });

  /** Every brand page is deliberately short: heading, definition sentence, profile links. */
  it('carries no narrative sections beyond the definition sentence', () => {
    render(
      <MemoryRouter>
        <SubBrandPageRoute slug="surabaya-siders" />
      </MemoryRouter>,
    );

    for (const absent of ['Apa yang dibahas', 'Siapa audiensnya', 'Topik utama', 'Audiens']) {
      expect(screen.queryByText(absent)).not.toBeInTheDocument();
    }
  });

  it('lists only the profiles that brand actually has', () => {
    const { container } = render(
      <MemoryRouter>
        <SubBrandPageRoute slug="siders-vox" />
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: /Instagram @sidersvox/ })).toHaveAttribute(
      'href',
      'https://www.instagram.com/sidersvox',
    );
    expect(screen.queryByRole('link', { name: /TikTok/ })).not.toBeInTheDocument();

    const organization = readJsonLd(container).find((node) => node['@type'] === 'Organization')!;
    expect(organization.sameAs).toEqual(['https://www.instagram.com/sidersvox']);
  });

  /** `scripts/prerender.mjs` ships this markup in the HTML and `main.tsx` hydrates it rather than
   *  repainting, so a mismatch here would be a visible flash in production, not just a warning. */
  it('hydrates the prerendered markup without a mismatch', async () => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

    const markup = renderToString(
      <StaticRouter location="/surabaya-siders">
        <SubBrandPageRoute slug="surabaya-siders" />
      </StaticRouter>,
    );

    const container = document.createElement('div');
    container.innerHTML = markup;
    document.body.appendChild(container);

    const errors: unknown[][] = [];
    const spy = vi.spyOn(console, 'error').mockImplementation((...args) => {
      errors.push(args);
    });

    const root = await act(async () =>
      hydrateRoot(
        container,
        <MemoryRouter initialEntries={['/surabaya-siders']}>
          <SubBrandPageRoute slug="surabaya-siders" />
        </MemoryRouter>,
      ),
    );

    spy.mockRestore();
    act(() => root.unmount());
    container.remove();

    expect(errors.flat().join(' ')).not.toMatch(/hydrat|did not match|server HTML/i);
  });
});
