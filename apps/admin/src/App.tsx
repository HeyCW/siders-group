import { Navigate, Route, Routes } from 'react-router-dom';

function LoginPage() {
  return <div>Login</div>;
}

function ArticleListPage() {
  return <div>Articles</div>;
}

function ArticleEditPage() {
  return <div>Edit article</div>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/articles" replace />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/articles" element={<ArticleListPage />} />
      <Route path="/articles/:id" element={<ArticleEditPage />} />
    </Routes>
  );
}
