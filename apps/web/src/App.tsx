import { Route, Routes } from 'react-router-dom';
import { SiteLayout } from './layout/SiteLayout';
import { HomePage } from './pages/HomePage';
import { NewsPage } from './pages/NewsPage';
import { ArticlePage } from './pages/ArticlePage';
import { ContactPage } from './pages/ContactPage';
import { TeamPage } from './pages/TeamPage';
import { SubBrandPageRoute } from './pages/SubBrandPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { SUB_BRAND_PAGES } from './lib/subBrandPages';

export default function App() {
  return (
    <Routes>
      <Route element={<SiteLayout />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/news" element={<NewsPage />} />
        <Route path="/news/:slug" element={<ArticlePage />} />
        <Route path="/contact" element={<ContactPage />} />
        <Route path="/team" element={<TeamPage />} />
        {/* One top-level route per anak usaha. Registered from the data rather than written out,
            so adding a brand to `SUB_BRAND_PAGES` gives it a route, a prerendered HTML file and a
            sitemap entry in one edit. */}
        {SUB_BRAND_PAGES.map((page) => (
          <Route
            key={page.slug}
            path={`/${page.slug}`}
            element={<SubBrandPageRoute slug={page.slug} />}
          />
        ))}
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
