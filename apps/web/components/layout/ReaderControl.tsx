'use client';

import { usePathname } from 'next/navigation';
import { API_URL } from '../../lib/env';
import { useReaderSession } from '../../lib/readerSession';

function signInHref(currentPath: string): string {
  return `${API_URL}/auth/google?next=${encodeURIComponent(currentPath)}`;
}

/**
 * Session-dependent masthead furniture: a sign-in link while anonymous, the reader's name,
 * avatar, and a sign-out control once authenticated, and nothing signed-in-looking while
 * resolution is still in flight (`specs/reader-session/spec.md` - "The masthead reflects
 * session state"). Rendered in both `SiteHeader`'s dateline row and `StickyNav`'s right-hand
 * slot, so it must read cleanly at both sizes.
 */
export function ReaderControl({ className = '' }: { className?: string }) {
  const pathname = usePathname();
  const { session, signOut } = useReaderSession();

  const base = 'font-sans text-[11px] font-bold uppercase tracking-widest';

  if (session.status === 'loading') {
    // Deliberately empty rather than a placeholder — the spec forbids the signed-in
    // presentation here, and an anonymous-looking flash for what may turn out to be a
    // signed-in reader is worse than a brief blank slot.
    return <span className={className} aria-hidden="true" />;
  }

  if (session.status === 'anonymous') {
    return (
      <a href={signInHref(pathname ?? '/')} className={`${base} text-muted hover:text-ink ${className}`}>
        Sign in
      </a>
    );
  }

  const { account } = session;
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {account.avatarUrl ? (
        <img
          src={account.avatarUrl}
          alt=""
          className="h-5 w-5 rounded-full object-cover"
          referrerPolicy="no-referrer"
        />
      ) : (
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-ink text-[10px] font-bold text-paper">
          {account.name.charAt(0).toUpperCase()}
        </span>
      )}
      <span className={`${base} text-ink`}>{account.name}</span>
      <button
        type="button"
        onClick={() => void signOut()}
        className={`${base} text-muted hover:text-ink`}
      >
        Sign out
      </button>
    </div>
  );
}
