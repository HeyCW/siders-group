// `/` uses ISR (`export const revalidate = 60` in app/page.tsx) with real fetches and no
// `dynamic` override, so `next build` statically renders it at build time — which means it
// needs a reachable API even in a CI job that only wants "does this compile" and has no real
// backend. This stands in for that API with the minimal empty responses `/` needs to build.
import http from 'node:http';

const PORT = process.env.MOCK_API_PORT ? Number(process.env.MOCK_API_PORT) : 4310;

const EMPTY_LIST = { success: true, data: [] };

const ROUTES = {
  '/home': EMPTY_LIST,
  '/articles': EMPTY_LIST,
  '/categories': EMPTY_LIST,
};

const NOT_FOUND = {
  success: false,
  error: { code: 'not_found', message: 'Not found (CI mock API)' },
};

const server = http.createServer((req, res) => {
  const { pathname } = new URL(req.url ?? '/', `http://localhost:${PORT}`);
  const body = ROUTES[pathname];
  res.setHeader('Content-Type', 'application/json');
  res.writeHead(body ? 200 : 404);
  res.end(JSON.stringify(body ?? NOT_FOUND));
});

server.listen(PORT, () => {
  console.log(`CI mock API listening on :${PORT}`);
});
