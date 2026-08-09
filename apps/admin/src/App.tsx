import { Suspense, lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { ArticleListPage } from './pages/ArticleListPage.js';
import { NewArticlePage } from './pages/NewArticlePage.js';
import { TaxonomyManagementPage } from './pages/TaxonomyManagementPage.js';
import { categoriesApi, tagsApi } from './lib/taxonomyApi.js';

// The editor page pulls in the entire Tiptap toolchain (~450KB); the list and taxonomy screens
// never need it, so it is loaded on demand rather than in the app's initial bundle
// (CLAUDE.md - "lazy-load large features").
const ArticleEditPage = lazy(() => import('./pages/ArticleEditPage.js').then((m) => ({ default: m.ArticleEditPage })));

function LoginPage() {
  return <div>Login</div>;
}

function EditorLoadingFallback() {
  return <div className="p-8 text-gray-500 dark:text-gray-400">Loading editor…</div>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/articles" replace />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/articles" element={<ArticleListPage />} />
      <Route path="/articles/new" element={<NewArticlePage />} />
      <Route
        path="/articles/:id"
        element={
          <Suspense fallback={<EditorLoadingFallback />}>
            <ArticleEditPage />
          </Suspense>
        }
      />
      <Route
        path="/categories"
        element={<TaxonomyManagementPage title="Categories" singularLabel="category" api={categoriesApi} />}
      />
      <Route path="/tags" element={<TaxonomyManagementPage title="Tags" singularLabel="tag" api={tagsApi} />} />
    </Routes>
  );
}
