import { apiFetch } from './api.js';

/**
 * Mirrors `apps/api/src/modules/users/user.mapper.ts`'s `StaffUserDto` — not re-exported via
 * `@siders/contracts` today, so this is the admin app's own copy of the shape it reads.
 * `permissionKeys`/`isOwner` are for rendering only; every enforcement decision still happens
 * server-side on each request (specs/authorization/spec.md - "A staff member's own effective
 * permissions and Owner status are readable").
 */
export interface StaffMeResponse {
  id: string;
  email: string;
  name: string;
  roleId: string;
  roleName: string;
  status: 'active' | 'disabled';
  mustChangePassword: boolean;
  createdAt: string;
  permissionKeys: string[];
  isOwner: boolean;
}

interface Envelope<T> {
  success: true;
  data: T;
}

/**
 * Wraps the six endpoints the admin session lifecycle consumes, all through `apiFetch` so CSRF
 * header attachment and the refresh/bootstrap recovery interceptor stay in one place
 * (proposal.md - "Route every call through the existing apiFetch").
 */
export const sessionApi = {
  /** The sign-in screen's own submission — excluded from refresh recovery, since a 403 here
   *  can only ever be a stale CSRF cookie, never an expired access credential to refresh
   *  (specs/admin-session/spec.md - "The sign-in screen's own submission never triggers a
   *  refresh"). */
  login(email: string, password: string): Promise<void> {
    return apiFetch<void>('/auth/staff/login', { method: 'POST', body: { email, password }, isSignIn: true });
  },

  me(): Promise<StaffMeResponse> {
    return apiFetch<Envelope<StaffMeResponse>>('/users/me').then((r) => r.data);
  },

  changePassword(currentPassword: string, newPassword: string): Promise<void> {
    return apiFetch<void>('/staff/me/password', { method: 'POST', body: { currentPassword, newPassword } });
  },

  refresh(): Promise<void> {
    return apiFetch<void>('/auth/refresh', { method: 'POST' });
  },

  logout(): Promise<void> {
    return apiFetch<void>('/auth/logout', { method: 'POST' });
  },

  /** The CSRF cookie re-pairing endpoint (`GET /auth/csrf`) — a safe method, so it carries no
   *  CSRF header of its own and cannot itself 403 `csrf_failed`. */
  bootstrapCsrf(): Promise<void> {
    return apiFetch<void>('/auth/csrf');
  },
};
