/** @type {import('next').NextConfig} */
const nextConfig = {
  // The `/news` and `/news/[slug]` pages use ISR (per docs/ARCHITECTURE.md §8.2:
  // 60s + on-demand revalidate via /api/revalidate). Per-page revalidate values
  // are set where each page is implemented (add-web-news-pages follow-up).
};

export default nextConfig;
