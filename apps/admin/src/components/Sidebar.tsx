import { useEffect, useState, type ComponentType } from 'react';
import { NavLink } from 'react-router-dom';
import type { PermissionKey } from '@siders/contracts';
import { useDarkMode } from '../hooks/useDarkMode.js';
import { useSession } from '../session/SessionContext.js';
import { contactApi } from '../lib/contactApi.js';
import { hasPermission } from '../lib/permissions.js';

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

function IconAnakUsaha(props: IconProps) {
  return (
    <IconShell {...props}>
      <path d="M4 17V5a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v12M12 17V9a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v8M3 17h14" />
      <path d="M6.5 7h1M6.5 10h1M6.5 13h1M9.5 7h1M9.5 10h1M9.5 13h1" />
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

function IconGuidePicks(props: IconProps) {
  return (
    <IconShell {...props}>
      <path d="M10 3 4 6.5v7L10 17l6-3.5v-7L10 3Z" />
      <path d="M10 3v14M4 6.5l6 3.5 6-3.5" />
    </IconShell>
  );
}

function IconPartners(props: IconProps) {
  return (
    <IconShell {...props}>
      <circle cx="6" cy="7" r="2.3" />
      <circle cx="14" cy="7" r="2.3" />
      <path d="M2.5 16v-1a3.5 3.5 0 0 1 3.5-3.5h0A3.5 3.5 0 0 1 9.5 15v1" />
      <path d="M10.5 16v-1a3.5 3.5 0 0 1 3.5-3.5h0a3.5 3.5 0 0 1 3.5 3.5v1" />
    </IconShell>
  );
}

function IconMessages(props: IconProps) {
  return (
    <IconShell {...props}>
      <path d="M3 5h14a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z" />
      <path d="m3.5 5.5 6.5 5 6.5-5" />
    </IconShell>
  );
}

function IconComments(props: IconProps) {
  return (
    <IconShell {...props}>
      <path d="M3 4h14a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H8l-4 3v-3H3a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z" />
    </IconShell>
  );
}

function IconRoles(props: IconProps) {
  return (
    <IconShell {...props}>
      <path d="M10 2.5 3.5 5.2v4.3c0 4 2.8 6.6 6.5 8 3.7-1.4 6.5-4 6.5-8V5.2L10 2.5Z" />
      <path d="M7.3 9.8 9 11.5l3.7-3.9" />
    </IconShell>
  );
}

function IconStaff(props: IconProps) {
  return (
    <IconShell {...props}>
      <circle cx="10" cy="6.5" r="3" />
      <path d="M3.5 16.5v-1a6.5 6.5 0 0 1 13 0v1" />
    </IconShell>
  );
}

function IconReaders(props: IconProps) {
  return (
    <IconShell {...props}>
      <circle cx="7" cy="6.5" r="2.7" />
      <circle cx="14" cy="8" r="2" />
      <path d="M2.5 16v-1a4.5 4.5 0 0 1 4.5-4.5h0a4.5 4.5 0 0 1 4.5 4.5v1" />
      <path d="M12.5 12.2a3.3 3.3 0 0 1 4.5 3.1v0.7" />
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
   *  else is gated on the same permission(s) the server enforces, matching `PermissionKey`
   *  (specs/authorization/spec.md). A set is any-of: `Staff` is reachable by either
   *  `user.manage` or `role.manage`, mirroring the server's `requireAnyPermission` gate
   *  (specs/staff-account-management/spec.md - "Staff administration console"). Rendering here
   *  is cosmetic only; a 403 from the server is still authoritative regardless of what this
   *  shows (specs/admin-session/spec.md - "Permission-aware rendering is cosmetic, never
   *  authoritative"). */
  permission?: PermissionKey | readonly PermissionKey[];
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
      { to: '/anak-usaha', label: 'Anak Perusahaan', icon: IconAnakUsaha, permission: 'anak-usaha.manage' },
      {
        to: '/anak-usaha-presentation',
        label: 'Anak Usaha — Tampilan',
        icon: IconAnakUsaha,
        permission: 'anak-usaha.manage',
      },
    ],
  },
  {
    label: 'Curation',
    items: [
      { to: '/curation', label: 'Home curation', icon: IconHomeCuration, permission: 'news.manage' },
      { to: '/reels', label: 'Reels library', icon: IconReelsLibrary, permission: 'news.manage' },
      { to: '/reels-curation', label: 'Reels curation', icon: IconReelsCuration, permission: 'news.manage' },
      { to: '/guide-picks', label: 'Guide of the week', icon: IconGuidePicks, permission: 'news.manage' },
    ],
  },
  {
    label: 'Site',
    items: [
      { to: '/partners', label: 'Partners', icon: IconPartners, permission: 'settings.manage' },
      { to: '/messages', label: 'Messages', icon: IconMessages, permission: 'contact.manage' },
    ],
  },
  {
    label: 'Community',
    items: [
      { to: '/moderation/comments', label: 'Comments', icon: IconComments, permission: 'moderation.manage' },
      { to: '/moderation/readers', label: 'Readers', icon: IconReaders, permission: 'moderation.manage' },
    ],
  },
  {
    label: 'Access',
    items: [
      { to: '/roles', label: 'Roles', icon: IconRoles, permission: 'role.manage' },
      { to: '/staff', label: 'Staff', icon: IconStaff, permission: ['user.manage', 'role.manage'] },
    ],
  },
];

function jakartaClock(): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit' }).format(new Date());
}

/** The unread-count pill, shared verbatim by the wordmark and the `Messages` nav item — one
 *  definition instead of two copies of the same markup and class string. */
function UnreadCountBadge({ count, title }: { count: number; title?: string }) {
  return (
    <span
      className="rounded-full bg-[var(--panel-signal)] px-1.5 py-0.5 text-[10px] font-medium leading-none text-white"
      title={title}
    >
      {count}
    </span>
  );
}

/** The collapsed-sidebar equivalent of `UnreadCountBadge` — a bare dot, since a collapsed nav
 *  item has no room for a count. */
function UnreadDot() {
  return <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-[var(--panel-signal)]" />;
}

/** Matches `CommentModerationPage`'s own poll interval and `docs/ARCHITECTURE.md` §8.2's
 *  reasoning — this is the house convention for "staff should notice new X soon-ish", not a new
 *  cadence (design.md - "Poll interval: 30 seconds"). */
const UNREAD_MESSAGES_POLL_INTERVAL_MS = 30_000;

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
  const [unreadMessages, setUnreadMessages] = useState(0);
  const { session, signOut } = useSession();
  const account = session.status === 'authenticated' ? session.account : null;

  useEffect(() => {
    const id = setInterval(() => setClock(jakartaClock()), 30_000);
    return () => clearInterval(id);
  }, []);

  // The Owner-bypass / any-of rule itself lives in `hasPermission`, shared with `StaffPage.tsx`
  // — this wrapper only adds the "no permission listed" shortcut, which is specific to nav items
  // like Dashboard that every signed-in account may see.
  function canSee(permission: PermissionKey | readonly PermissionKey[] | undefined): boolean {
    if (!permission) return true;
    return hasPermission(account, permission);
  }

  const canSeeMessages = canSee('contact.manage');

  // Polled independently of the inbox page itself — the badge must reflect the unread count
  // whether or not an admin has ever opened /messages (design.md - "The badge lives on a
  // Messages nav item... and the wordmark mirrors it only when the wordmark is actually
  // rendered"). Skipped entirely for an account that cannot see the endpoint, so this never
  // spends a request on a 403 nobody will act on.
  useEffect(() => {
    if (!canSeeMessages) {
      setUnreadMessages(0);
      return;
    }
    let cancelled = false;
    function poll() {
      contactApi
        .unreadCount()
        .then(({ count }) => {
          if (!cancelled) setUnreadMessages(count);
        })
        .catch(() => {
          /* a transient failure just leaves the last known count showing */
        });
    }
    poll();
    const id = setInterval(poll, UNREAD_MESSAGES_POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [canSeeMessages]);

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
        {!collapsed && (
          <span className="flex items-center gap-1.5">
            <span className="font-display text-lg tracking-tight">Siders</span>
            {unreadMessages > 0 && (
              <UnreadCountBadge
                count={unreadMessages}
                title={`${unreadMessages} unread message${unreadMessages === 1 ? '' : 's'}`}
              />
            )}
          </span>
        )}
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
                {({ isActive }) => {
                  const showUnreadBadge = item.to === '/messages' && unreadMessages > 0;
                  return (
                    <>
                      {isActive && <span className="absolute bottom-1 left-0 top-1 w-0.5 rounded-full bg-[var(--panel-signal)]" />}
                      <span className="relative shrink-0">
                        <item.icon className="h-[18px] w-[18px]" />
                        {/* The count lives on the nav item, not just the wordmark — the wordmark
                            disappears entirely when the sidebar is collapsed, exactly the state
                            where a compact badge matters most (design.md - "Badge lives on a
                            Messages nav item... the wordmark mirrors it only when the wordmark
                            is actually rendered"). Collapsed: a bare dot. Expanded: the count
                            renders inline below instead. */}
                        {showUnreadBadge && collapsed && <UnreadDot />}
                      </span>
                      {!collapsed && (
                        <span className="flex flex-1 items-center justify-between gap-2">
                          <span className="truncate font-medium">{item.label}</span>
                          {showUnreadBadge && <UnreadCountBadge count={unreadMessages} />}
                        </span>
                      )}
                    </>
                  );
                }}
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
