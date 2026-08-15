'use client';

import { useState } from 'react';

const linkClass =
  'border border-ink px-3 py-2 font-sans text-[11px] font-bold uppercase tracking-widest transition-colors duration-hover ease-hover hover:bg-ink hover:text-paper focus-visible:bg-ink focus-visible:text-paper';

/**
 * Real, working share actions — no backend required for any of these, unlike the counts in
 * `EngagementBar`. Reads `window.location` only at click time, never at render, so this never
 * affects the page's static/ISR rendering.
 */
export function ShareLinks({ title }: { title: string }) {
  const [copied, setCopied] = useState(false);

  function share(build: (url: string) => string) {
    window.open(build(window.location.href), '_blank', 'noopener,noreferrer');
  }

  async function copyLink() {
    await navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex flex-wrap gap-2 pb-[clamp(20px,3vw,28px)] pt-3">
      <button
        type="button"
        className={linkClass}
        onClick={() =>
          share((url) => `https://wa.me/?text=${encodeURIComponent(`${title} ${url}`)}`)
        }
      >
        WhatsApp
      </button>
      <button
        type="button"
        className={linkClass}
        onClick={() =>
          share(
            (url) =>
              `https://twitter.com/intent/tweet?text=${encodeURIComponent(title)}&url=${encodeURIComponent(url)}`,
          )
        }
      >
        X
      </button>
      <button type="button" className={linkClass} onClick={copyLink}>
        {copied ? 'Copied!' : 'Copy link'}
      </button>
    </div>
  );
}
