import { useEffect, useState, type ComponentType } from 'react';
import { NavLink } from 'react-router-dom';
import type { PermissionKey } from '@siders/contracts';
import { useDarkMode } from '../hooks/useDarkMode.js';
import { useSession } from '../session/SessionContext.js';

interface IconProps {
  className?: string;
}

function IconShell({ children, className }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {children}
    </svg>
  );
}

function IconDashboard(props: IconProps) {
  return (
    <IconShell {...props}>
      <rect x="3" y="3" width="6" height="6" rx="1" />
      <rect x="11" y="3" width="6" height="6" rx="1" />
      <rect x="3" y="11" width="6" height="6" rx="1" />
      <rect x="11" y="11" width="6" height="6" rx="1" />
    </IconShell>
  );
}

function IconArticles(props: IconProps) {
  return (
    <IconShell {...props}>
      <path d="M5 3h7l3 3v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" />
      <path d="M12 3v3h3" />
      <path d="M7 8h3M7 11h6M7 14h6" />
    </IconShell>
  );
}

function IconCategories(props: IconProps) {
  return (
    <IconShell {...props}>
      <path d="M3 6a1 1 0 0 1 1-1h4l2 2h6a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6Z" />
    </IconShell>
  );
}

function IconTags(props: IconProps) {
  return (
    <IconShell {...props}>
      <path d="M4 4h6l7 7-6 6-7-7V4Z" />
      <circle cx="8" cy="8" r="1.1" fill="currentColor" stroke="none" />
    </IconShell>
  );
}

function IconHomeCuration(props: IconProps) {
  return (
    <IconShell {...props}>
      <path d="M4 9 10 4l6 5" />
      <path d="M5 8.5V16a1 1 0 0 0 1 1h3v-4h2v4h3a1 1 0 0 0 1-1V8.5" />
    </IconShell>
  );
}

function IconReelsLibrary(props: IconProps) {
  return (
    <IconShell {...props}>
      <circle cx="10" cy="10" r="7" />
      <path d="M8.5 7.3v5.4l4.5-2.7-4.5-2.7Z" fill="currentColor" stroke="none" />
    </IconShell>
  );
}

function IconReelsCuration(props: IconProps) {
  return (
    <IconShell {...props}>
      <path d="M10 3 3 7l7 4 7-4-7-4Z" />
      <path d="M3 11l7 4 7-4" />
    </IconShell>
  );
}

function IconChevron(props: IconProps) {
  return (
    <IconShell {...props}>
      <path d="M12.5 4.5 7 10l5.5 5.5" />
    </IconShell>
  );
}

interface NavItem {
  to: string;
  label: string;
  icon: ComponentType<IconProps>;
  /** Omitted for items every signed-in account may see (just Dashboard today) — everything
   *  else is gated on the same permission the server enforces, matching `PermissionKey`
   *  (specs/authorization/spec.md). Rendering here is cosmetic only; a 403 from the server is
   *  still authoritative regardless of what this shows
   *  (specs/admin-session/spec.md - "Permission-aware rendering is cosmetic, never
   *  authoritative"). */
  permission?: PermissionKey;
}

interface NavGroup {
  label: string | null;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  { label: null, items: [{ to: '/dashboard', label: 'Dashboard', icon: IconDashboard }] },
  {
    label: 'Content',
    items: [
      { to: '/articles', label: 'Articles', icon: IconArticles, permission: 'news.manage' },
      { to: '/categories', label: 'Categories', icon: IconCategories, permission: 'category.manage' },
      { to: '/tags', label: 'Tags', icon: IconTags, permission: 'tag.manage' },
    ],
  },
  {
    label: 'Curation',
    items: [
      { to: '/curation', label: 'Home curation', icon: IconHomeCuration, permission: 'news.manage' },
      { to: '/reels', label: 'Reels library', icon: IconReelsLibrary, permission: 'news.manage' },
      { to: '/reels-curation', label: 'Reels curation', icon: IconReelsCuration, permission: 'news.manage' },
    ],
  },
];

function jakartaClock(): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit' }).format(new Date());
}

export interface SidebarProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
  onNavigate?: () => void;
  /** Off for the mobile drawer, which has its own close control and is never collapsed. */
  showCollapseToggle?: boolean;
}

export function Sidebar({ collapsed, onToggleCollapse, onNavigate, showCollapseToggle = true }: SidebarProps) {
  const [isDark, toggleDark] = useDarkMode();
  const [clock, setClock] = useState(jakartaClock);
  const { session, signOut } = useSession();
  const account = session.status === 'authenticated' ? session.account : null;

  useEffect(() => {
    const id = setInterval(() => setClock(jakartaClock()), 30_000);
    return () => clearInterval(id);
  }, []);

  function canSee(permission: PermissionKey | undefined): boolean {
    if (!permission) return true;
    if (!account) return false;
    // The Owner role satisfies every permission check (specs/authorization/spec.md - "Owner
    // sees every permission-gated affordance").
    return account.isOwner || account.permissionKeys.includes(permission);
  }

  // signOut() clears local session state; RequireSession reacts to that and redirects to
  // /login on its own — no navigation call needed here (specs/admin-session/spec.md -
  // "Sign-out calls the endpoint and returns to sign-in").
  function handleSignOut() {
    void signOut();
  }

  return (
    <nav
      className={`siders-scope flex h-full flex-col bg-[var(--panel-bg)] text-[var(--panel-fg)] transition-[width] duration-200 ease-out ${collapsed ? 'w-16' : 'w-60'}`}
      aria-label="Admin navigation"
    >
      <div className={`flex items-center border-b border-[var(--panel-fg)]/10 px-3 py-4 ${collapsed ? 'justify-center' : 'justify-between'}`}>
        {!collapsed && <span className="font-display text-lg tracking-tight">Siders</span>}
        {showCollapseToggle && (
          <button
            type="button"
            onClick={onToggleCollapse}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="rounded-md p-1 text-[var(--panel-fg)]/50 transition-colors hover:bg-[var(--panel-fg)]/10 hover:text-[var(--panel-fg)]"
          >
            <IconChevron className={`h-4 w-4 transition-transform ${collapsed ? 'rotate-180' : ''}`} />
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-3">
        {NAV_GROUPS.map((group, groupIndex) => {
          const visibleItems = group.items.filter((item) => canSee(item.permission));
          if (visibleItems.length === 0) return null;
          return (
          <div key={group.label ?? `group-${groupIndex}`}>
            {group.label &&
              (collapsed ? (
                <div className="mx-1 my-3 h-px bg-[var(--panel-fg)]/10" />
              ) : (
                <p className="px-3 pb-1 pt-4 font-mono text-[10px] uppercase tracking-widest text-[var(--panel-fg)]/35">
                  {group.label}
                </p>
              ))}
            {visibleItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={onNavigate}
                title={collapsed ? item.label : undefined}
                className={({ isActive }) =>
                  `relative flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${
                    isActive
                      ? 'text-[var(--panel-signal)]'
                      : 'text-[var(--panel-fg)]/70 hover:bg-[var(--panel-fg)]/5 hover:text-[var(--panel-fg)]'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    {isActive && <span className="absolute bottom-1 left-0 top-1 w-0.5 rounded-full bg-[var(--panel-signal)]" />}
                    <item.icon className="h-[18px] w-[18px] shrink-0" />
                    {!collapsed && <span className="truncate font-medium">{item.label}</span>}
                  </>
                )}
              </NavLink>
            ))}
          </div>
          );
        })}
      </div>

      <div className="space-y-2 border-t border-[var(--panel-fg)]/10 px-3 py-3">
        <div className={`flex items-center font-mono text-[10px] uppercase tracking-widest text-[var(--panel-fg)]/40 ${collapsed ? 'justify-center' : 'justify-between'}`}>
          {!collapsed && <span>Jakarta</span>}
          <span>{clock}</span>
        </div>
        <div className={`flex gap-2 ${collapsed ? 'flex-col items-center' : 'items-center justify-between'}`}>
          <button
            type="button"
            onClick={toggleDark}
            aria-label="Toggle dark mode"
            title="Toggle dark mode"
            className="rounded-md border border-[var(--panel-fg)]/15 px-2 py-1 text-xs"
          >
            {isDark ? '☀' : '🌙'}
          </button>
          <button
            type="button"
            onClick={handleSignOut}
            title="Sign out"
            className="rounded-md border border-[var(--panel-fg)]/15 px-2 py-1 text-xs text-[var(--panel-fg)]/70 hover:text-[var(--panel-fg)]"
          >
            {collapsed ? '⏻' : 'Sign out'}
          </button>
        </div>
      </div>
    </nav>
  );
}
