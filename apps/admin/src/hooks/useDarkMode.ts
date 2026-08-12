import { useEffect, useState } from 'react';

const STORAGE_KEY = 'siders-admin-dark-mode';

function readInitial(): boolean {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored !== null) return stored === 'true';
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
}

/** Persisted dark mode toggle (specs/article-editor/spec.md is silent on persistence
 *  specifics, but design.md's editor requirements list "dark mode toggle with persisted
 *  user preference" — tasks.md 10.8). Tailwind's `darkMode: 'class'` reads `<html class="dark">`. */
export function useDarkMode(): [boolean, () => void] {
  const [isDark, setIsDark] = useState(readInitial);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark);
    localStorage.setItem(STORAGE_KEY, String(isDark));
  }, [isDark]);

  return [isDark, () => setIsDark((prev) => !prev)];
}
