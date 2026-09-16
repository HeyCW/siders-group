import { renderToString } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server';
import App from './App';
import { SUB_BRAND_PAGES } from './lib/subBrandPages';

/**
 * The build-time counterpart to `main.tsx`, used only by `scripts/prerender.mjs`.
 *
 * Nothing in this module runs in the browser. It exists so a handful of routes can be turned into
 * real HTML at build time; see the script for which routes and why.
 *
 * `StrictMode` is omitted on purpose — it double-invokes render, which costs time and buys nothing
 * without effects, and effects never run during `renderToString`.
 */
const BASENAME = '/siders';

/** `path` is app-relative (`/surabaya-siders`). `StaticRouter` matches against the full pathname,
 *  so the basename has to be prepended here — given only the app-relative path it matches nothing
 *  and renders an empty string. */
export function render(path: string): string {
  return renderToString(
    <StaticRouter basename={BASENAME} location={`${BASENAME}${path}`}>
      <App />
    </StaticRouter>,
  );
}

/** Re-exported so the prerender script works from the same list the router does. */
export { SUB_BRAND_PAGES };
