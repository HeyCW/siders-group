import { useEffect, useState } from 'react';

const STORAGE_KEY = 'siders-admin-sidebar-collapsed';

function readInitial(): boolean {
  return localStorage.getItem(STORAGE_KEY) === 'true';
}

/** Persisted sidebar collapse toggle, same pattern as `useDarkMode`. */
export function useSidebarCollapsed(): [boolean, () => void] {
  const [collapsed, setCollapsed] = useState(readInitial);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, String(collapsed));
  }, [collapsed]);

  return [collapsed, () => setCollapsed((prev) => !prev)];
}
