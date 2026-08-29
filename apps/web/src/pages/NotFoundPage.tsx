import { Link } from 'react-router-dom';
import { Container } from '../components/layout/Container';
import { useDocumentTitle } from '../lib/useDocumentTitle';

export function NotFoundPage() {
  useDocumentTitle('Not found — Siders');

  return (
    <Container className="pt-[clamp(24px,4vw,44px)]">
      <h1 className="font-serif text-[clamp(28px,4vw,44px)] font-bold uppercase tracking-[0.02em]">
        Not found
      </h1>
      <p className="mt-3.5 text-[15px] leading-[1.6]">
        This page doesn&apos;t exist, or hasn&apos;t been built yet.
      </p>
      <Link to="/" className="mt-3.5 inline-block font-sans text-[11px] font-bold uppercase tracking-widest underline">
        Back to home
      </Link>
    </Container>
  );
}
