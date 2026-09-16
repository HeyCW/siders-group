#!/usr/bin/env node
// Build-time prerendering for the anak usaha pages.
//
// The site is a client-rendered SPA on static hosting (making-csr), so every route is served the
// same `index.html`: home page title, no <h1>, home page structured data. Googlebot does render
// JS and would eventually see the right thing, but that is a second, slower pass, and Bing and
// the social/link-preview crawlers never run JS at all. For pages whose entire purpose is to rank
// for one brand name, "eventually" is not good enough.
//
// So these routes — and only these, because they are the only ones that render entirely from
// static data with no API call — are rendered to real HTML here: correct <title>, <h1>, body copy
// and JSON-LD, all present before a single byte of JavaScript runs.
//
// Output is `dist/<slug>/index.html`. Apache serves that for `/siders/<slug>/`, and redirects the
// slashless form to it (`public/.htaccess` skips its SPA rewrite for real directories), which is
// why `subBrandUrl()` declares the trailing-slash form as canonical.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(__dirname, '..');
const distDir = resolve(appRoot, 'dist');
const ssrDir = resolve(appRoot, 'dist-ssr');
const SITE_URL = 'https://sidersmedia.com/siders';

/** Replaces the *content* of a tag matched by `pattern`, leaving the rest of the tag untouched. */
function replaceAttr(html, pattern, value) {
  if (!pattern.test(html)) throw new Error(`Template is missing ${pattern}`);
  return html.replace(pattern, (match, before, after) => `${before}${escapeAttr(value)}${after}`);
}

function escapeAttr(value) {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function escapeText(value) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Swaps the head tags that are per-page. Everything else in the template — fonts, favicon, the
 * site-wide Organization/WebSite graph — is shared by design and stays exactly as it is.
 */
function applyHead(template, page, url, image) {
  let html = template;
  html = html.replace(/(<title>)[\s\S]*?(<\/title>)/, `$1${escapeText(page.title)}$2`);
  html = replaceAttr(
    html,
    /(<meta\s+name="description"\s+content=")[\s\S]*?(")/,
    page.metaDescription,
  );
  html = replaceAttr(html, /(<link rel="canonical" href=")[^"]*(")/, url);
  html = replaceAttr(html, /(<meta property="og:title" content=")[^"]*(")/, page.title);
  html = replaceAttr(
    html,
    /(<meta\s+property="og:description"\s+content=")[\s\S]*?(")/,
    page.metaDescription,
  );
  html = replaceAttr(html, /(<meta property="og:url" content=")[^"]*(")/, url);
  html = replaceAttr(html, /(<meta property="og:image" content=")[^"]*(")/, image);
  html = replaceAttr(html, /(<meta name="twitter:title" content=")[^"]*(")/, page.title);
  html = replaceAttr(
    html,
    /(<meta\s+name="twitter:description"\s+content=")[\s\S]*?(")/,
    page.metaDescription,
  );
  html = replaceAttr(html, /(<meta name="twitter:image" content=")[^"]*(")/, image);
  return html;
}

function buildSsrBundle() {
  execFileSync(
    process.execPath,
    [
      resolve(appRoot, 'node_modules/vite/bin/vite.js'),
      'build',
      '--ssr',
      'src/entry-server.tsx',
      '--outDir',
      'dist-ssr',
      '--logLevel',
      'warn',
    ],
    { cwd: appRoot, stdio: 'inherit' },
  );
}

async function main() {
  buildSsrBundle();

  const { render, SUB_BRAND_PAGES } = await import(
    pathToFileURL(resolve(ssrDir, 'entry-server.js')).href
  );

  const template = readFileSync(resolve(distDir, 'index.html'), 'utf8');
  if (!template.includes('<div id="root"></div>')) {
    throw new Error('Template is missing the empty <div id="root"></div> mount point');
  }

  for (const page of SUB_BRAND_PAGES) {
    const url = `${SITE_URL}/${page.slug}/`;
    const image = `${SITE_URL}/${page.logo}`;
    const body = render(`/${page.slug}`);

    if (!body.includes(`<h1`)) {
      throw new Error(`Prerendered /${page.slug} has no <h1> — the route did not match`);
    }

    const html = applyHead(template, page, url, image).replace(
      '<div id="root"></div>',
      `<div id="root">${body}</div>`,
    );

    const outDir = resolve(distDir, page.slug);
    mkdirSync(outDir, { recursive: true });
    writeFileSync(resolve(outDir, 'index.html'), html);
    console.log(`[prerender] ${page.slug}/index.html (${(html.length / 1024).toFixed(1)} kB)`);
  }

  rmSync(ssrDir, { recursive: true, force: true });
}

main().catch((error) => {
  console.error(`[prerender] ${error.message}`);
  process.exit(1);
});
