import { Suspense, lazy } from 'react';
import { Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { DashboardPage } from './pages/DashboardPage.js';
import { ArticleListPage } from './pages/ArticleListPage.js';
import { NewArticlePage } from './pages/NewArticlePage.js';
import { TaxonomyManagementPage } from './pages/TaxonomyManagementPage.js';
import { HomeCurationPage } from './pages/HomeCurationPage.js';
import { LoginPage } from './pages/LoginPage.js';
import { ChangePasswordPage } from './pages/ChangePasswordPage.js';
import { ReelLibraryPage } from './pages/ReelLibraryPage.js';
import { ReelsCurationPage } from './pages/ReelsCurationPage.js';
import { PartnersPage } from './pages/PartnersPage.js';
import { GuidePicksPage } from './pages/GuidePicksPage.js';
import { ContactMessagesPage } from './pages/ContactMessagesPage.js';
import { CommentModerationPage } from './pages/CommentModerationPage.js';
import { ReaderModerationPage } from './pages/ReaderModerationPage.js';
import { RolesPage } from './pages/RolesPage.js';
import { StaffPage } from './pages/StaffPage.js';
import { anakUsahaApi, categoriesApi, tagsApi } from './lib/taxonomyApi.js';
import { SessionProvider } from './session/SessionContext.js';
import { RedirectIfAuthenticated, RequireSession } from './session/RouteGuards.js';
import { AppShell } from './components/AppShell.js';

// The editor page pulls in the entire Tiptap toolchain (~450KB); the list and taxonomy screens
// never need it, so it is loaded on demand rather than in the app's initial bundle
// (CLAUDE.md - "lazy-load large features").
const ArticleEditPage = lazy(() => import('./pages/ArticleEditPage.js').then((m) => ({ default: m.ArticleEditPage })));

function EditorLoadingFallback() {
  return <div className="p-8 text-gray-500 dark:text-gray-400">Loading editor…</div>;
}

export default function App() {
  return (
    <SessionProvider>
      <Routes>
        <Route
          path="/login"
          element={
            <RedirectIfAuthenticated>
              <LoginPage />
            </RedirectIfAuthenticated>
          }
        />
        <Route
          element={
            <RequireSession>
              <Outlet />
            </RequireSession>
          }
        >
          <Route path="/change-password" element={<ChangePasswordPage />} />
          <Route element={<AppShell />}>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<DashboardPage />} />
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
            <Route
              path="/anak-usaha"
              element={<TaxonomyManagementPage title="Anak Perusahaan" singularLabel="anak perusahaan" api={anakUsahaApi} />}
            />
            <Route path="/curation" element={<HomeCurationPage />} />
            <Route path="/reels" element={<ReelLibraryPage />} />
            <Route path="/reels-curation" element={<ReelsCurationPage />} />
            <Route path="/partners" element={<PartnersPage />} />
            <Route path="/guide-picks" element={<GuidePicksPage />} />
            <Route path="/messages" element={<ContactMessagesPage />} />
            <Route path="/moderation/comments" element={<CommentModerationPage />} />
            <Route path="/moderation/readers" element={<ReaderModerationPage />} />
            <Route path="/roles" element={<RolesPage />} />
            <Route path="/staff" element={<StaffPage />} />
          </Route>
        </Route>
      </Routes>
    </SessionProvider>
  );
}
