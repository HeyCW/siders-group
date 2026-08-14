import { createContext, useContext, useState, type ReactNode } from 'react';

interface ChromeContextValue {
  hideChrome: boolean;
  setHideChrome: (hidden: boolean) => void;
}

const ChromeContext = createContext<ChromeContextValue | null>(null);

/** Lets a page (the article editor's focus mode) hide the app shell's sidebar, not just its
 *  own header — otherwise "focus mode" would still leave the nav rail on screen. */
export function ChromeProvider({ children }: { children: ReactNode }) {
  const [hideChrome, setHideChrome] = useState(false);
  return <ChromeContext.Provider value={{ hideChrome, setHideChrome }}>{children}</ChromeContext.Provider>;
}

export function useChrome(): ChromeContextValue {
  const ctx = useContext(ChromeContext);
  if (!ctx) throw new Error('useChrome must be used within ChromeProvider');
  return ctx;
}
