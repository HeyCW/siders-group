#!/usr/bin/env node
// Build-time sitemap generation — there is no server left to render one on request
// (making-csr), so this fetches the published article list once at build time and writes a
// static public/sitemap.xml that vite build then copies into dist/ alongside index.html.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SITE_URL = 'https://sidersmedia.com/siders';
const PAGE_SIZE = 100;

function loadApiUrl() {
  if (process.env.VITE_API_URL) return process.env.VITE_API_URL;
  const envPath = resolve(__dirname, '../.env.local');
  if (existsSync(envPath)) {
    const match = readFileSync(envPath, 'utf8').match(/^VITE_API_URL=(.+)$/m);
    if (match) return match[1].trim();
  }
  throw new Error('VITE_API_URL not set (checked process.env and .env.local)');
}

async function fetchAllArticles(apiUrl) {
  const articles = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const res = await fetch(`${apiUrl}/api/articles?limit=${PAGE_SIZE}&offset=${offset}&order=newest`);
    if (!res.ok) throw new Error(`GET /articles failed with ${res.status}`);
    const { data } = await res.json();
    articles.push(...data);
    if (data.length < PAGE_SIZE) break;
  }
  return articles;
}

function urlEntry(loc, lastmod, changefreq, priority) {
  const lastmodTag = lastmod ? `\n    <lastmod>${lastmod}</lastmod>` : '';
  return `  <url>\n    <loc>${loc}</loc>${lastmodTag}\n    <changefreq>${changefreq}</changefreq>\n    <priority>${priority}</priority>\n  </url>`;
}

async function main() {
  const today = new Date().toISOString().slice(0, 10);

  const staticEntries = [
    urlEntry(`${SITE_URL}/`, today, 'daily', '1.0'),
    urlEntry(`${SITE_URL}/news`, today, 'daily', '0.9'),
    urlEntry(`${SITE_URL}/team`, today, 'monthly', '0.5'),
    urlEntry(`${SITE_URL}/contact`, today, 'monthly', '0.5'),
  ];

  // Degrades to static-only routes when the API can't be reached, the same way the home page's
  // own fetches degrade to an empty section rather than failing outright (see HomePage.tsx) —
  // a build shouldn't hard-fail just because the sitemap couldn't reach the API.
  let articleEntries = [];
  try {
    const apiUrl = loadApiUrl();
    const articles = await fetchAllArticles(apiUrl);
    articleEntries = articles.map((article) =>
      urlEntry(`${SITE_URL}/news/${article.slug}`, article.publishedAt.slice(0, 10), 'weekly', '0.8'),
    );
  } catch (err) {
    console.warn(`[sitemap] Skipping article URLs — ${err.message}`);
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${[
    ...staticEntries,
    ...articleEntries,
  ].join('\n')}\n</urlset>\n`;

  const outPath = resolve(__dirname, '../public/sitemap.xml');
  writeFileSync(outPath, xml, 'utf8');
  console.log(`[sitemap] Wrote ${staticEntries.length + articleEntries.length} URLs to ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
