import { useLocation } from 'react-router-dom';
import { currentLocationWithQuery, signInHref } from '../../lib/signInHref';

/**
 * The inline stand-in for a control that needs a reader session.
 *
 * A prompt, never a hidden control and never a disabled one that fails on use
 * (specs/web-public-site/spec.md - "A signed-out reader is prompted to sign in, never shown a
 * dead control"). A disabled button says "this is broken"; an absent one says "this site has no
 * comments". Neither is true — the reader simply is not signed in yet, and this says so.
 */
export function SignInPrompt({ action }: { action: string }) {
  const pathname = useLocation().pathname;

  return (
    <p className="font-sans text-[11px] font-bold uppercase tracking-widest text-muted">
      <a
        href={signInHref(pathname)}
        onClick={(e) => {
          e.currentTarget.href = signInHref(currentLocationWithQuery());
        }}
        // Signal yellow behind ink rather than as the text colour — #FFD100 on #F7F6F2 does not
        // meet contrast, and the design's own idiom for it is a highlight block.
        className="border-b-2 border-ink pb-0.5 text-ink transition-colors duration-hover ease-hover hover:bg-signal focus-visible:bg-signal"
      >
        Sign in
      </a>{' '}
      {action}
    </p>
  );
}
