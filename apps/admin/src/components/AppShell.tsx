import { NavLink, Outlet } from 'react-router-dom';
import type { PermissionKey } from '@siders/contracts';
import { useSession } from '../session/SessionContext.js';

interface NavItem {
  to: string;
  label: string;
  permission: PermissionKey;
}

const NAV_ITEMS: NavItem[] = [
  { to: '/articles', label: 'Articles', permission: 'news.manage' },
  { to: '/categories', label: 'Categories', permission: 'category.manage' },
  { to: '/tags', label: 'Tags', permission: 'tag.manage' },
  { to: '/curation', label: 'Curation', permission: 'news.manage' },
  { to: '/reels', label: 'Reels', permission: 'news.manage' },
  { to: '/reels-curation', label: 'Reels Curation', permission: 'news.manage' },
];

/**
 * The app's chrome for every signed-in route: navigation gated on the caller's reported
 * permissions, and the sign-out control. Rendering here is cosmetic only — every gated action
 * still goes through the normal request path, and a 403 is authoritative regardless of what
 * was shown (specs/admin-session/spec.md - "Permission-aware rendering is cosmetic, never
 * authoritative"), the same pattern `useAsyncAction.ts`/`TaxonomyManagementPage.tsx` already
 * use for individual controls.
 */
export function AppShell() {
  const { session, signOut } = useSession();
  const account = session.status === 'authenticated' ? session.account : null;

  function canSee(permission: PermissionKey): boolean {
    if (!account) return false;
    // The Owner role satisfies every permission check (specs/authorization/spec.md - "Owner
    // sees every permission-gated affordance").
    return account.isOwner || account.permissionKeys.includes(permission);
  }

  return (
    <div className="min-h-screen bg-white dark:bg-gray-900">
      <nav className="flex items-center justify-between border-b border-gray-200 px-6 py-3 dark:border-gray-700">
        <div className="flex gap-4">
          {NAV_ITEMS.filter((item) => canSee(item.permission)).map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `text-sm font-medium ${isActive ? 'text-gray-900 dark:text-white' : 'text-gray-500 dark:text-gray-400'}`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </div>
        {/* signOut() clears local session state; RequireSession reacts to that and redirects
            to /login on its own — no navigation call needed here (specs/admin-session/spec.md -
            "Sign-out calls the endpoint and returns to sign-in"). */}
        <button
          type="button"
          onClick={() => void signOut()}
          className="text-sm text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
        >
          Sign out
        </button>
      </nav>
      <Outlet />
    </div>
  );
}
