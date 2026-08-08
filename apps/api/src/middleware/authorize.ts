import { and, eq } from 'drizzle-orm';
import type { NextFunction, Request, Response } from 'express';
import { permissions, readers, rolePermissions, sessions, users, type Database } from '@siders/db';
import type { PermissionKey } from '@siders/contracts';
import { AppError } from './errorHandler.js';
import { loadEnv } from '../config/env.js';
import { getDatabase } from '../lib/db.js';
import { getOwnerRoleId } from '../lib/ownerRole.js';

export interface StaffRoleContext {
  roleId: string;
  isOwner: boolean;
}

declare module 'express-serve-static-core' {
  interface Request {
    staffRole?: StaffRoleContext;
  }
}

/**
 * Every guard-producing function marks its returned middleware so the startup route audit
 * (`auditAuthorizationDeclarations`) can recognize a route as declared without depending on
 * which of the four shapes was used.
 */
const DECLARATION_MARKER = Symbol('authorizationDeclaration');

type Middleware = (req: Request, res: Response, next: NextFunction) => void | Promise<void>;

function markDeclaration(fn: Middleware): Middleware {
  Object.assign(fn, { [DECLARATION_MARKER]: true });
  return fn;
}

function db(): Database {
  return getDatabase(loadEnv());
}

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** Every route explicitly opts into being public — silence is a denial, not a grant. */
export function requirePublic() {
  return markDeclaration((_req, _res, next) => {
    next();
  });
}

/**
 * A session is usable only while it is unrevoked and inside both its sliding and absolute
 * lifetimes — the same three conditions `auth.service.ts`'s refresh enforces, applied here so
 * a session that aged out mid-credential can't keep working until the access token expires
 * (specs/authentication/spec.md - "Revoked sessions are rejected without waiting for expiry").
 */
function isSessionUsable(row: { revokedAt: Date | null; expiresAt: Date; absoluteExpiresAt: Date }): boolean {
  const now = Date.now();
  return !row.revokedAt && row.expiresAt.getTime() > now && row.absoluteExpiresAt.getTime() > now;
}

const SESSION_VALIDITY_COLUMNS = {
  revokedAt: sessions.revokedAt,
  expiresAt: sessions.expiresAt,
  absoluteExpiresAt: sessions.absoluteExpiresAt,
} as const;

interface ReaderAccess {
  subjectId: string;
  status: 'active' | 'banned';
  mutedUntil: Date | null;
}

async function resolveReaderAccess(sessionId: string): Promise<ReaderAccess | null> {
  const [row] = await db()
    .select({
      subjectId: sessions.subjectId,
      ...SESSION_VALIDITY_COLUMNS,
      status: readers.status,
      mutedUntil: readers.mutedUntil,
    })
    .from(sessions)
    .innerJoin(readers, eq(sessions.subjectId, readers.id))
    .where(and(eq(sessions.id, sessionId), eq(sessions.subjectType, 'reader')))
    .limit(1);
  if (!row || !isSessionUsable(row)) return null;
  return { subjectId: row.subjectId, status: row.status, mutedUntil: row.mutedUntil };
}

/**
 * Reachable only by an authenticated reader whose account is active. A muted reader keeps
 * read access but is rejected at content-creating (non-safe-method) endpoints
 * (specs/authorization/spec.md - "Reader-only authorization").
 */
export function requireReader() {
  return markDeclaration(async (req: Request, _res: Response, next: NextFunction) => {
    try {
      if (!req.auth || req.auth.subjectType !== 'reader') {
        throw new AppError('Reader session required', 401, 'unauthenticated');
      }
      const access = await resolveReaderAccess(req.auth.sessionId);
      if (!access || access.subjectId !== req.auth.subjectId || access.status !== 'active') {
        throw new AppError('Reader session required', 401, 'unauthenticated');
      }
      if (access.mutedUntil && access.mutedUntil.getTime() > Date.now() && MUTATING_METHODS.has(req.method)) {
        throw new AppError('Reader is muted', 403, 'reader_muted');
      }
      next();
    } catch (err) {
      next(err);
    }
  });
}

interface StaffAccess {
  subjectId: string;
  status: 'active' | 'disabled';
  roleId: string;
  mustChangePassword: boolean;
  permissionKeys: string[];
}

/** One Drizzle query — session, subject status, role, must-change flag, and every granted permission key. */
async function resolveStaffAccess(sessionId: string): Promise<StaffAccess | null> {
  const rows = await db()
    .select({
      subjectId: sessions.subjectId,
      ...SESSION_VALIDITY_COLUMNS,
      status: users.status,
      roleId: users.roleId,
      mustChangePassword: users.mustChangePassword,
      permissionKey: permissions.key,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.subjectId, users.id))
    .leftJoin(rolePermissions, eq(rolePermissions.roleId, users.roleId))
    .leftJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
    .where(and(eq(sessions.id, sessionId), eq(sessions.subjectType, 'staff')));

  const [first] = rows;
  if (!first || !isSessionUsable(first)) return null;
  return {
    subjectId: first.subjectId,
    status: first.status,
    roleId: first.roleId,
    mustChangePassword: first.mustChangePassword,
    permissionKeys: rows.map((r) => r.permissionKey).filter((k): k is string => k !== null),
  };
}

function passwordChangeRequiredError(): AppError {
  return new AppError('Password change required before continuing', 403, 'password_change_required');
}

export interface RequireStaffOptions {
  /**
   * Set only on the two routes the pending-change gate must never block: the password-change
   * endpoint itself, and the caller's own-account endpoint (so the change screen has an
   * identity to render). Every other staff-only or permission-gated route stays blocked,
   * Owner included — this is not a permission bypass
   * (specs/authorization/spec.md - "A pending password change blocks every gated endpoint").
   */
  allowPendingPasswordChange?: boolean;
}

/**
 * Reachable only by an active staff member, regardless of role or permissions — the check
 * is on subject type, not on a role string that might be absent
 * (specs/authorization/spec.md - "Staff-only authorization").
 */
export function requireStaff(options: RequireStaffOptions = {}) {
  return markDeclaration(async (req: Request, _res: Response, next: NextFunction) => {
    try {
      if (!req.auth || req.auth.subjectType !== 'staff') {
        throw new AppError('Staff session required', 403, 'forbidden');
      }
      const access = await resolveStaffAccess(req.auth.sessionId);
      if (!access || access.subjectId !== req.auth.subjectId || access.status !== 'active') {
        throw new AppError('Staff session required', 403, 'forbidden');
      }
      if (access.mustChangePassword && !options.allowPendingPasswordChange) {
        throw passwordChangeRequiredError();
      }
      const ownerRoleId = await getOwnerRoleId(db());
      req.staffRole = { roleId: access.roleId, isOwner: access.roleId === ownerRoleId };
      next();
    } catch (err) {
      next(err);
    }
  });
}

/**
 * Reachable only by a staff member whose role includes `key` — evaluated fresh on every
 * request (never from the access credential), so a role change or permission edit takes
 * effect on the caller's very next request. The Owner role always passes, recognized by
 * the seeded role's immutable id, never by name or slug
 * (specs/authorization/spec.md - "Permission-based authorization", "The Owner role
 * satisfies every permission check"). A pending password change rejects before the
 * permission is even evaluated, and the Owner bypass below does not cover it — an Owner
 * holding an admin-issued temporary password is exactly the case that check exists for.
 */
export function requirePermission(key: PermissionKey) {
  return markDeclaration(async (req: Request, _res: Response, next: NextFunction) => {
    try {
      if (!req.auth || req.auth.subjectType !== 'staff') {
        throw new AppError('Staff session required', 403, 'forbidden');
      }
      const access = await resolveStaffAccess(req.auth.sessionId);
      if (!access || access.subjectId !== req.auth.subjectId || access.status !== 'active') {
        throw new AppError('Staff session required', 403, 'forbidden');
      }
      if (access.mustChangePassword) {
        throw passwordChangeRequiredError();
      }
      const ownerRoleId = await getOwnerRoleId(db());
      const isOwner = access.roleId === ownerRoleId;
      if (!isOwner && !access.permissionKeys.includes(key)) {
        throw new AppError('Insufficient permission', 403, 'forbidden');
      }
      req.staffRole = { roleId: access.roleId, isOwner };
      next();
    } catch (err) {
      next(err);
    }
  });
}

function isDeclared(handle: unknown): boolean {
  return typeof handle === 'function' && Boolean((handle as unknown as Record<symbol, boolean>)[DECLARATION_MARKER]);
}

/**
 * Fails boot rather than serving a route with no declaration. Walks Express's own route
 * table (undocumented but stable across the 4.x line, and duck-typed here rather than
 * strictly modeled — these are private internals, not a contract worth over-fitting a type
 * to) looking for the declaration marker on at least one middleware in each terminal
 * route's stack (specs/authorization/spec.md - "Startup fails on an undeclared route").
 */
export function auditAuthorizationDeclarations(app: unknown): void {
  const undeclared: string[] = [];

  function walk(stack: unknown): void {
    if (!Array.isArray(stack)) return;
    for (const layer of stack as Array<Record<string, unknown>>) {
      const route = layer.route as { path?: string; methods?: Record<string, boolean>; stack?: unknown[] } | undefined;
      if (route) {
        const methods = Object.keys(route.methods ?? {}).join(',').toUpperCase();
        const declared = (route.stack ?? []).some(
          (l) => isDeclared((l as Record<string, unknown>).handle),
        );
        if (!declared) undeclared.push(`${methods} ${route.path}`);
        continue;
      }
      const handle = layer.handle as { stack?: unknown[] } | undefined;
      if (handle && !isDeclared(handle) && Array.isArray(handle.stack)) {
        walk(handle.stack);
      }
    }
  }

  walk((app as { _router?: { stack?: unknown[] } })._router?.stack);

  if (undeclared.length > 0) {
    throw new Error(
      `Routes with no authorization declaration (public/reader/staff/permission): ${undeclared.join(', ')}`,
    );
  }
}
