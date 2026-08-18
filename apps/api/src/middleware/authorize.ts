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
  /** The caller's currently effective permission keys — for `GET /users/me` to report back to
   *  the client for rendering only (specs/authorization/spec.md - "A staff member's own
   *  effective permissions and Owner status are readable"). Never itself a grant. */
  permissionKeys: string[];
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

export interface RequireReaderOptions {
  /**
   * Whether this endpoint creates reader-authored content — the one thing both a mute and a ban
   * restrict, as two flavours of the same "cannot author" sanction differing only in duration
   * (specs/authorization/spec.md - "Muted reader cannot author content"; design.md - Decision 7,
   * `openspec/changes/add-community-moderation`). Every other reader-only endpoint — reading,
   * liking, reporting, the reader's own account — requires only an authenticated reader identity,
   * regardless of mute or ban state.
   *
   * Defaults to the request's method being mutating. That heuristic is the safe default for a
   * route nobody thought about — a new POST is assumed to author content — but it is only a
   * proxy, and it is wrong in both directions: a `PATCH /reader/me` updating a display name
   * authors nothing and would be blocked, while a hypothetical content endpoint reached by GET
   * would not be. Say so explicitly wherever the method and the meaning diverge.
   */
  createsContent?: boolean;
}

/**
 * Reachable only by an authenticated reader — read, like, and report access require only that
 * identity, regardless of `status`. Ban and mute are two flavours of the same "cannot author"
 * sanction, differing only in duration (mute is time-boxed, ban is indefinite until unbanned),
 * and both are enforced only where `createsContent` is true
 * (specs/authorization/spec.md - "Reader-only authorization"; design.md - Decision 7,
 * `openspec/changes/add-community-moderation`).
 *
 * Before this, `status !== 'active'` was checked unconditionally, which made a banned reader
 * indistinguishable from one holding no session at all — rejected at every reader-only endpoint,
 * including their own read access. That was account termination in effect, which is more than a
 * comment-authoring sanction ever asked for; a banned reader stays signed in and keeps reading,
 * liking, and reporting, and only loses the ability to comment.
 */
export function requireReader(options: RequireReaderOptions = {}) {
  return markDeclaration(async (req: Request, _res: Response, next: NextFunction) => {
    try {
      if (!req.auth || req.auth.subjectType !== 'reader') {
        throw new AppError('Reader session required', 401, 'unauthenticated');
      }
      const access = await resolveReaderAccess(req.auth.sessionId);
      if (!access || access.subjectId !== req.auth.subjectId) {
        throw new AppError('Reader session required', 401, 'unauthenticated');
      }
      const createsContent = options.createsContent ?? MUTATING_METHODS.has(req.method);
      if (createsContent) {
        if (access.status === 'banned') {
          throw new AppError('Reader is banned from commenting', 403, 'reader_banned');
        }
        if (access.mutedUntil && access.mutedUntil.getTime() > Date.now()) {
          throw new AppError('Reader is muted', 403, 'reader_muted');
        }
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
      req.staffRole = { roleId: access.roleId, isOwner: access.roleId === ownerRoleId, permissionKeys: access.permissionKeys };
      next();
    } catch (err) {
      next(err);
    }
  });
}

/**
 * Reachable by a staff member whose role includes **any** of the given permissions — evaluated
 * fresh on every request (never from the access credential), so a role change or permission edit
 * takes effect on the caller's very next request. The Owner role always passes, recognized by
 * the seeded role's immutable id, never by name or slug (specs/authorization/spec.md -
 * "Permission-based authorization", "The Owner role satisfies every permission check"). A
 * pending password change rejects before the permission is even evaluated, and the Owner bypass
 * below does not cover it — an Owner holding an admin-issued temporary password is exactly the
 * case that check exists for.
 *
 * A single permission is the common case (`requirePermission` below is `requireAnyPermission`
 * with one key); the any-of form exists for the two read endpoints (`GET /roles`, `GET /staff`)
 * that two mutually dependent administration flows both need: assigning a role requires the
 * staff list, and creating a staff account requires the role list. Gating either list on only
 * its "own" permission leaves the other flow's holder unable to complete it
 * (specs/rbac-management/spec.md - "Enumerating roles"; specs/staff-account-management/spec.md -
 * "Enumerating staff accounts").
 */
export function requireAnyPermission(...keys: PermissionKey[]) {
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
      if (!isOwner && !keys.some((key) => access.permissionKeys.includes(key))) {
        throw new AppError('Insufficient permission', 403, 'forbidden');
      }
      req.staffRole = { roleId: access.roleId, isOwner, permissionKeys: access.permissionKeys };
      next();
    } catch (err) {
      next(err);
    }
  });
}

/** The single-permission case of `requireAnyPermission` — kept as its own name since it is the
 *  overwhelming majority of routes and reads better at the call site than a one-element spread. */
export function requirePermission(key: PermissionKey) {
  return requireAnyPermission(key);
}

function isDeclared(handle: unknown): boolean {
  return typeof handle === 'function' && Boolean((handle as unknown as Record<symbol, boolean>)[DECLARATION_MARKER]);
}

/** A nested `Router`'s layer stack, or null when the handle is not a router. */
function nestedStack(handle: unknown): unknown[] | null {
  if (typeof handle !== 'function' && (typeof handle !== 'object' || handle === null)) return null;
  const candidate = handle as { stack?: unknown; _router?: { stack?: unknown }; router?: { stack?: unknown } };
  for (const stack of [candidate.stack, candidate._router?.stack, candidate.router?.stack]) {
    if (Array.isArray(stack)) return stack;
  }
  return null;
}

/**
 * Recovers a readable mount path from the layer's compiled regexp. Express keeps no copy of the
 * original path string on the layer, and `layer.path` is only populated during dispatch, so at
 * audit time this is the only way to name the offending mount in an error message.
 */
function mountPathOf(layer: Record<string, unknown>): string {
  const regexp = layer.regexp as { source?: string; fast_slash?: boolean } | undefined;
  if (!regexp?.source || regexp.fast_slash === true) return '';
  const match = /^\^\\\/(?<path>[^\\]*)/.exec(regexp.source);
  return match?.groups?.path ? `/${match.groups.path}` : '';
}

/** Global middleware (`app.use(fn)`); Express marks the no-path case with `regexp.fast_slash`. */
function isGloballyMounted(layer: Record<string, unknown>): boolean {
  return (layer.regexp as { fast_slash?: boolean } | undefined)?.fast_slash === true;
}

/**
 * Fails boot rather than serving a route with no declaration. Walks Express's own route table
 * (undocumented but stable across the 4.x line, and duck-typed here rather than strictly
 * modeled — these are private internals, not a contract worth over-fitting a type to) looking
 * for the declaration marker on at least one middleware in each terminal route's stack
 * (specs/authorization/spec.md - "Startup fails on an undeclared route").
 *
 * Fails **closed** on anything it cannot see into. An audit that silently skips the shapes it
 * does not recognize is not an audit — it reports success exactly where it has no evidence.
 * Two cases matter, and both used to pass silently:
 *
 * - A **mounted sub-app** (`app.use('/x', express())`). Express wraps it in a `mounted_app`
 *   closure and keeps no reference to the sub-app on the layer, so its routes are genuinely
 *   unreachable from here. Un-introspectable means rejected, not assumed fine.
 * - A **path-mounted plain function** (`app.use('/x', handler)`), which can respond and so is
 *   an endpoint, unlike global middleware such as `express.json()`.
 */
export function auditAuthorizationDeclarations(app: unknown): void {
  const undeclared: string[] = [];

  function walk(stack: unknown, mountPath: string, inheritedDeclaration: boolean): void {
    if (!Array.isArray(stack)) return;
    // A declaration mounted with `router.use()` covers every route registered after it in that
    // router, so it is tracked as the walk proceeds rather than looked for per route.
    let declaredHere = inheritedDeclaration;

    for (const layer of stack as Array<Record<string, unknown>>) {
      const route = layer.route as { path?: string; methods?: Record<string, boolean>; stack?: unknown[] } | undefined;
      if (route) {
        const declared =
          declaredHere || (route.stack ?? []).some((l) => isDeclared((l as Record<string, unknown>).handle));
        if (!declared) {
          const methods = Object.keys(route.methods ?? {}).join(',').toUpperCase();
          undeclared.push(`${methods} ${mountPath}${route.path ?? ''}`);
        }
        continue;
      }

      const handle = layer.handle;
      if (isDeclared(handle)) {
        declaredHere = true;
        continue;
      }

      const nested = nestedStack(handle);
      if (nested) {
        walk(nested, `${mountPath}${mountPathOf(layer)}`, declaredHere);
        continue;
      }

      if (typeof handle === 'function') {
        // Error-handling middleware takes (err, req, res, next) and never serves a route.
        if (isGloballyMounted(layer) || handle.length >= 4 || declaredHere) continue;
        const name = typeof handle.name === 'string' && handle.name ? handle.name : 'anonymous';
        undeclared.push(`ALL ${mountPath}${mountPathOf(layer)} (${name}, not introspectable)`);
        continue;
      }

      throw new Error(
        `Cannot audit authorization: unrecognized Express layer shape at "${mountPath}". ` +
          'Refusing to boot rather than assume it is declared.',
      );
    }
  }

  const root = app as { _router?: { stack?: unknown[] }; router?: { stack?: unknown[] } };
  walk(root._router?.stack ?? root.router?.stack, '', false);

  if (undeclared.length > 0) {
    throw new Error(
      `Routes with no authorization declaration (public/reader/staff/permission): ${undeclared.join(', ')}`,
    );
  }
}
