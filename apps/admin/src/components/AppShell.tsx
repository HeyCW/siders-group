import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar.js';
import { ChromeProvider, useChrome } from '../context/ChromeContext.js';
import { useSidebarCollapsed } from '../hooks/useSidebarCollapsed.js';

function IconMenu({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" className={className}>
      <path d="M3 5h14M3 10h14M3 15h14" />
    </svg>
  );
}

function IconClose({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" className={className}>
      <path d="M5 5l10 10M15 5 5 15" />
    </svg>
  );
}

function ShellChrome() {
  const { hideChrome } = useChrome();
  const [collapsed, toggleCollapsed] = useSidebarCollapsed();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Focus mode (article editor) hides every bit of app chrome, not just its own header.
  if (hideChrome) {
    return (
      <main className="siders-scope h-screen overflow-y-auto bg-[var(--paper)]">
        <Outlet />
      </main>
    );
  }

  return (
    <div className="siders-scope flex h-screen overflow-hidden bg-[var(--paper)]">
      <div className="hidden lg:block">
        <Sidebar collapsed={collapsed} onToggleCollapse={toggleCollapsed} />
      </div>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            aria-label="Close navigation"
            className="absolute inset-0 bg-black/40"
            onClick={() => setMobileOpen(false)}
          />
          <div className="relative h-full w-60 shadow-xl">
            <Sidebar
              collapsed={false}
              onToggleCollapse={() => setMobileOpen(false)}
              onNavigate={() => setMobileOpen(false)}
              showCollapseToggle={false}
            />
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              aria-label="Close navigation"
              className="absolute right-3 top-4 rounded-md p-1 text-[var(--panel-fg)]/60 hover:bg-[var(--panel-fg)]/10 hover:text-[var(--panel-fg)]"
            >
              <IconClose className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="siders-scope flex items-center justify-between border-b border-[var(--rule)] bg-[var(--paper)] px-4 py-3 text-[var(--ink)] lg:hidden">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-label="Open navigation"
            className="rounded-md p-1.5 hover:bg-[var(--ink)]/5"
          >
            <IconMenu className="h-5 w-5" />
          </button>
          <span className="font-display text-base tracking-tight">Siders</span>
          <span className="w-5" />
        </div>

        <main className="min-h-0 flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

/**
 * Persistent nav rail around every authenticated admin route (everything except `/login` and
 * `/change-password`). Permission-gated navigation and the sign-out control live in `Sidebar`,
 * not here — rendering there is cosmetic only, every gated action still goes through the normal
 * request path, and a 403 is authoritative regardless of what was shown
 * (specs/admin-session/spec.md - "Permission-aware rendering is cosmetic, never authoritative").
 */
export function AppShell() {
  return (
    <ChromeProvider>
      <ShellChrome />
    </ChromeProvider>
  );
}
