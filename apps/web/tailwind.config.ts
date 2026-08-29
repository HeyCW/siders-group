import type { Config } from 'tailwindcss';

/**
 * Siders Broadsheet visual tokens (Claude Design export, `Siders Broadsheet.dc.html`). Named
 * once here rather than re-derived as raw hex in every component — the design itself names
 * these ("paper" background, "ink" text, "signal" accent).
 */
export default {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        paper: '#F7F6F2',
        ink: '#141414',
        signal: '#FFD100',
        rule: '#E3E1D9',
        'rule-strong': '#C9C6BC',
        muted: '#55534D',
      },
      fontFamily: {
        // Populated by next/font/google in app/layout.tsx via CSS custom properties, so the
        // font files are self-hosted at build time rather than fetched from Google's CDN at
        // runtime (the prototype's own approach, via a <link> tag).
        serif: ['var(--font-serif)', 'Georgia', 'serif'],
        sans: ['var(--font-sans)', 'sans-serif'],
      },
      borderRadius: {
        DEFAULT: '2px',
      },
      transitionDuration: {
        hover: '120ms',
      },
      transitionTimingFunction: {
        hover: 'cubic-bezier(0,0,.2,1)',
      },
      keyframes: {
        ruledraw: {
          from: { transform: 'scaleX(0)' },
          to: { transform: 'scaleX(1)' },
        },
        inkfade: {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        riseIn: {
          from: { opacity: '0', transform: 'translateY(14px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        marquee: {
          from: { transform: 'translateX(0)' },
          to: { transform: 'translateX(-50%)' },
        },
      },
      animation: {
        ruledraw: 'ruledraw 240ms cubic-bezier(.22,1,.36,1) both',
        inkfade: 'inkfade 160ms ease-out both',
        riseIn: 'riseIn 560ms cubic-bezier(.22,1,.36,1) both',
        // Pure CSS, no scroll-position JS (design.md - "Ticker is pure CSS, not JS-driven"). The
        // track it animates is two identical halves back to back, so translating one full half's
        // width (-50%) loops seamlessly into the second half's identical start.
        marquee: 'marquee 36s linear infinite',
      },
    },
  },
  plugins: [],
} satisfies Config;
