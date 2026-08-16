'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { API_URL } from '../../lib/env';
import { useReaderSession } from '../../lib/readerSession';

function signInHref(currentLocation: string): string {
  return `${API_URL}/auth/google?next=${encodeURIComponent(currentLocation)}`;
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
  // Declared unconditionally per the Rules of Hooks even though it is only read in the
  // authenticated branch below.
  const [avatarFailed, setAvatarFailed] = useState(false);

  const base = 'font-sans text-[11px] font-bold uppercase tracking-widest';

  if (session.status === 'loading') {
    // Deliberately empty rather than a placeholder — the spec forbids the signed-in
    // presentation here, and an anonymous-looking flash for what may turn out to be a
    // signed-in reader is worse than a brief blank slot.
    return <span className={className} aria-hidden="true" />;
  }

  if (session.status === 'anonymous') {
    return (
      <a
        href={signInHref(pathname ?? '/')}
        // `usePathname()` carries no query string, but `/news`'s category filter lives in one
        // (`docs/ARCHITECTURE.md` §8.1 - "Filters live in the URL, so results are shareable").
        // Reading `window.location` here rather than `useSearchParams()` keeps this a plain
        // synchronous click handler: that hook forces a Suspense boundary around every render
        // of this component, and this component is mounted in the root layout, so it would
        // reach `/` and `/news/[slug]` too — routes 7.2 keeps statically rendered.
        onClick={(e) => {
          e.currentTarget.href = signInHref(window.location.pathname + window.location.search);
        }}
        className={`${base} text-muted hover:text-ink ${className}`}
      >
        Sign in
      </a>
    );
  }

  const { account } = session;
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {account.avatarUrl && !avatarFailed ? (
        <img
          // Remounts on a URL change, so a fresh avatar starts unfailed rather than inheriting
          // a stale `avatarFailed` from a previous account or a previous (now-dead) URL.
          key={account.avatarUrl}
          src={account.avatarUrl}
          alt=""
          className="h-5 w-5 rounded-full object-cover"
          referrerPolicy="no-referrer"
          onError={() => setAvatarFailed(true)}
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
