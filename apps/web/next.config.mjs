/** @type {import('next').NextConfig} */
const nextConfig = {
  // Static export: the production host is shared/cPanel hosting with a hard cap on Node
  // processes, so `web` ships as plain HTML/CSS/JS served by Apache rather than running
  // `next start`. This replaces the ISR + on-demand revalidation setup described in
  // docs/ARCHITECTURE.md §8.2 — publishing an article now triggers a full rebuild
  // (apps/api/src/lib/revalidate.ts) instead of an in-place page revalidation.
  output: 'export',
  // Directory-style `index.html` output (`/news/index.html` instead of `/news.html`) so
  // Apache serves clean URLs with no rewrite rules needed.
  trailingSlash: true,
  images: {
    // No Next.js Image Optimization server exists for a static export; ConnectedPlatforms.tsx
    // is the one `next/image` user left, so this disables the optimizer for it site-wide.
    unoptimized: true,
  },

  webpack: (config) => {
    // `@siders/contracts` (package.json `main: "./src/index.ts"`, consumed as raw TS source
    // via the pnpm workspace symlink, same as apps/api and apps/admin) imports its own siblings
    // with a NodeNext-style explicit `.js` extension pointing at `.ts` files — esbuild (Vite,
    // tsx) resolves that idiom natively, but webpack does not without this alias.
    config.resolve.extensionAlias = {
      '.js': ['.ts', '.tsx', '.js'],
    };
    return config;
  },
};

export default nextConfig;
