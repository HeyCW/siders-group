/** @type {import('next').NextConfig} */
const nextConfig = {
  // The `/news` and `/news/[slug]` pages use ISR (per docs/ARCHITECTURE.md §8.2:
  // 60s + on-demand revalidate via /api/revalidate). Per-page revalidate values
  // are set where each page is implemented (add-web-news-pages follow-up).

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
