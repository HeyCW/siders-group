// `next build` with `output: 'export'` (next.config.mjs) renders every page — `/`, `/news`, and
// `/news/[slug]`'s `generateStaticParams` included — at build time, so it needs a reachable API
// even in a CI job that only wants "does this compile" and has no real backend. This stands in
// for that API with the minimal responses those pages need to build.
//
// `/articles` must return at least one card: `output: 'export'` fails the build outright if a
// dynamic route's `generateStaticParams()` resolves to zero paths (Next treats that identically
// to the function not existing at all), so an empty list here would break `/news/[slug]` the
// same way a genuinely article-less production catalog would.
import http from 'node:http';

const PORT = process.env.MOCK_API_PORT ? Number(process.env.MOCK_API_PORT) : 4310;

const EMPTY_LIST = { success: true, data: [] };

const MOCK_ARTICLE_CARD = {
  id: '00000000-0000-0000-0000-000000000001',
  slug: 'ci-mock-article',
  title: 'CI mock article',
  excerpt: 'Placeholder content so the static export has at least one article page to build.',
  featuredImageUrl: null,
  categories: [],
  anakUsaha: null,
  authorName: 'CI',
  publishedAt: '2026-01-01T00:00:00.000Z',
};

const MOCK_ARTICLE_DETAIL = {
  ...MOCK_ARTICLE_CARD,
  bodyHtml: '<p>Placeholder body.</p>',
  seoTitle: null,
  seoDescription: null,
};

const NOT_FOUND = {
  success: false,
  error: { code: 'not_found', message: 'Not found (CI mock API)' },
};

const server = http.createServer((req, res) => {
  const { pathname } = new URL(req.url ?? '/', `http://localhost:${PORT}`);
  res.setHeader('Content-Type', 'application/json');

  if (pathname === '/articles') {
    res.writeHead(200);
    res.end(JSON.stringify({ success: true, data: [MOCK_ARTICLE_CARD] }));
    return;
  }
  if (pathname === `/articles/${MOCK_ARTICLE_CARD.slug}`) {
    res.writeHead(200);
    res.end(JSON.stringify({ success: true, data: MOCK_ARTICLE_DETAIL }));
    return;
  }
  if (pathname === '/home') {
    res.writeHead(200);
    res.end(JSON.stringify({ success: true, data: [MOCK_ARTICLE_CARD] }));
    return;
  }
  if (pathname === '/categories') {
    res.writeHead(200);
    res.end(JSON.stringify(EMPTY_LIST));
    return;
  }

  res.writeHead(404);
  res.end(JSON.stringify(NOT_FOUND));
});

server.listen(PORT, () => {
  console.log(`CI mock API listening on :${PORT}`);
});
