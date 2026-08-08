import { describe, expect, it, vi } from 'vitest';
import express, { Router, type NextFunction, type Request, type Response } from 'express';

vi.mock('../lib/db.js', () => ({ getDatabase: vi.fn() }));
vi.mock('../config/env.js', () => ({ loadEnv: vi.fn().mockReturnValue({}) }));
vi.mock('../lib/ownerRole.js', () => ({ getOwnerRoleId: vi.fn().mockResolvedValue('owner-role-id') }));

// A tiny fake query builder mimicking the shape `resolveStaffAccess`/`resolveReaderAccess`
// chain against: .select().from().innerJoin().leftJoin().leftJoin().where() / .limit().
function fakeDbReturning(rows: unknown[]) {
  const builder = {
    select: () => builder,
    from: () => builder,
    innerJoin: () => builder,
    leftJoin: () => builder,
    where: () => builder,
    limit: () => Promise.resolve(rows),
    // when awaited directly without .limit() (staff query has no .limit()) — resolve to rows.
    then: (resolve: (v: unknown[]) => void) => resolve(rows),
  };
  return builder;
}

import { auditAuthorizationDeclarations, requirePermission, requirePublic, requireReader, requireStaff } from './authorize.js';
import { getDatabase } from '../lib/db.js';

const HOUR_MS = 60 * 60 * 1000;

/** The session-validity columns every gated-path row carries: unrevoked, inside both lifetimes. */
function liveSession() {
  return {
    revokedAt: null,
    expiresAt: new Date(Date.now() + HOUR_MS),
    absoluteExpiresAt: new Date(Date.now() + 24 * HOUR_MS),
  };
}

function makeReq(auth?: { subjectId: string; subjectType: 'staff' | 'reader'; sessionId: string }): Request {
  return { auth, method: 'GET' } as unknown as Request;
}

describe('requirePublic', () => {
  it('always calls next() with no error', () => {
    const next = vi.fn();
    requirePublic()(makeReq(), {} as Response, next as NextFunction);
    expect(next).toHaveBeenCalledWith();
  });

  // POST /auth/logout and POST /auth/refresh are declared requirePublic() (auth.routes.ts),
  // so a staff member with a pending password change must still be able to reach them —
  // otherwise they could be stuck signed in but unable to sign out
  // (specs/authorization/spec.md - task 12.9). Asserted directly rather than inferred: a
  // staff `req.auth` is passed and no database mock is configured, so if this guard ever
  // started consulting session/account state, the missing mock would surface as a rejection
  // here rather than passing silently.
  it('stays reachable for a staff caller with a pending password change, without consulting the database', () => {
    const next = vi.fn();
    const req = makeReq({ subjectId: 'staff-1', subjectType: 'staff', sessionId: 'sess-1' });
    requirePublic()(req, {} as Response, next as NextFunction);
    expect(next).toHaveBeenCalledWith();
  });
});

describe('requireReader', () => {
  it('rejects an anonymous caller', async () => {
    const next = vi.fn();
    await requireReader()(makeReq(), {} as Response, next as NextFunction);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 401 }));
  });

  it('rejects a staff caller (no reader identity)', async () => {
    const next = vi.fn();
    const req = makeReq({ subjectId: 'staff-1', subjectType: 'staff', sessionId: 'sess-1' });
    await requireReader()(req, {} as Response, next as NextFunction);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 401 }));
  });

  it('allows an active reader', async () => {
    vi.mocked(getDatabase).mockReturnValue(
      fakeDbReturning([{ subjectId: 'reader-1', ...liveSession(), status: 'active', mutedUntil: null }]) as never,
    );
    const next = vi.fn();
    const req = makeReq({ subjectId: 'reader-1', subjectType: 'reader', sessionId: 'sess-1' });
    await requireReader()(req, {} as Response, next as NextFunction);
    expect(next).toHaveBeenCalledWith();
  });

  it('rejects a muted reader on a mutating request but not on a read', async () => {
    vi.mocked(getDatabase).mockReturnValue(
      fakeDbReturning([
        { subjectId: 'reader-1', ...liveSession(), status: 'active', mutedUntil: new Date(Date.now() + 60_000) },
      ]) as never,
    );
    const req = { ...makeReq({ subjectId: 'reader-1', subjectType: 'reader', sessionId: 'sess-1' }), method: 'POST' } as Request;
    const next = vi.fn();
    await requireReader()(req, {} as Response, next as NextFunction);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 403, code: 'reader_muted' }));
  });
});

describe('requireStaff', () => {
  it('rejects a reader caller', async () => {
    const next = vi.fn();
    const req = makeReq({ subjectId: 'reader-1', subjectType: 'reader', sessionId: 'sess-1' });
    await requireStaff()(req, {} as Response, next as NextFunction);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 403 }));
  });

  it('allows any active staff member regardless of permissions', async () => {
    vi.mocked(getDatabase).mockReturnValue(
      fakeDbReturning([
        { subjectId: 'staff-1', ...liveSession(), status: 'active', roleId: 'author-role-id', permissionKey: null },
      ]) as never,
    );
    const req = makeReq({ subjectId: 'staff-1', subjectType: 'staff', sessionId: 'sess-1' });
    const next = vi.fn();
    await requireStaff()(req, {} as Response, next as NextFunction);
    expect(next).toHaveBeenCalledWith();
    expect(req.staffRole).toEqual({ roleId: 'author-role-id', isOwner: false });
  });

  it('rejects a revoked session', async () => {
    vi.mocked(getDatabase).mockReturnValue(
      fakeDbReturning([{ subjectId: 'staff-1', ...liveSession(), revokedAt: new Date(), status: 'active', roleId: 'r', permissionKey: null }]) as never,
    );
    const req = makeReq({ subjectId: 'staff-1', subjectType: 'staff', sessionId: 'sess-1' });
    const next = vi.fn();
    await requireStaff()(req, {} as Response, next as NextFunction);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 403 }));
  });

  it('rejects a session past its sliding expiry, without waiting for the credential to lapse', async () => {
    vi.mocked(getDatabase).mockReturnValue(
      fakeDbReturning([
        {
          subjectId: 'staff-1',
          ...liveSession(),
          expiresAt: new Date(Date.now() - 1000),
          status: 'active',
          roleId: 'r',
          permissionKey: null,
        },
      ]) as never,
    );
    const req = makeReq({ subjectId: 'staff-1', subjectType: 'staff', sessionId: 'sess-1' });
    const next = vi.fn();
    await requireStaff()(req, {} as Response, next as NextFunction);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 403 }));
  });

  it('rejects a session past its absolute lifetime', async () => {
    vi.mocked(getDatabase).mockReturnValue(
      fakeDbReturning([
        {
          subjectId: 'staff-1',
          ...liveSession(),
          absoluteExpiresAt: new Date(Date.now() - 1000),
          status: 'active',
          roleId: 'r',
          permissionKey: null,
        },
      ]) as never,
    );
    const req = makeReq({ subjectId: 'staff-1', subjectType: 'staff', sessionId: 'sess-1' });
    const next = vi.fn();
    await requireStaff()(req, {} as Response, next as NextFunction);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 403 }));
  });

  it('rejects a staff member with a pending password change', async () => {
    vi.mocked(getDatabase).mockReturnValue(
      fakeDbReturning([
        {
          subjectId: 'staff-1',
          ...liveSession(),
          status: 'active',
          roleId: 'author-role-id',
          mustChangePassword: true,
          permissionKey: null,
        },
      ]) as never,
    );
    const req = makeReq({ subjectId: 'staff-1', subjectType: 'staff', sessionId: 'sess-1' });
    const next = vi.fn();
    await requireStaff()(req, {} as Response, next as NextFunction);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 403, code: 'password_change_required' }));
  });

  it('allows a pending password change through when the route opts in', async () => {
    vi.mocked(getDatabase).mockReturnValue(
      fakeDbReturning([
        {
          subjectId: 'staff-1',
          ...liveSession(),
          status: 'active',
          roleId: 'author-role-id',
          mustChangePassword: true,
          permissionKey: null,
        },
      ]) as never,
    );
    const req = makeReq({ subjectId: 'staff-1', subjectType: 'staff', sessionId: 'sess-1' });
    const next = vi.fn();
    await requireStaff({ allowPendingPasswordChange: true })(req, {} as Response, next as NextFunction);
    expect(next).toHaveBeenCalledWith();
  });
});

describe('requirePermission', () => {
  it('allows a staff member whose role includes the permission', async () => {
    vi.mocked(getDatabase).mockReturnValue(
      fakeDbReturning([
        { subjectId: 'staff-1', ...liveSession(), status: 'active', roleId: 'editor-role-id', permissionKey: 'news.manage' },
      ]) as never,
    );
    const req = makeReq({ subjectId: 'staff-1', subjectType: 'staff', sessionId: 'sess-1' });
    const next = vi.fn();
    await requirePermission('news.manage')(req, {} as Response, next as NextFunction);
    expect(next).toHaveBeenCalledWith();
  });

  it('rejects a staff member whose role lacks the permission', async () => {
    vi.mocked(getDatabase).mockReturnValue(
      fakeDbReturning([
        { subjectId: 'staff-1', ...liveSession(), status: 'active', roleId: 'author-role-id', permissionKey: null },
      ]) as never,
    );
    const req = makeReq({ subjectId: 'staff-1', subjectType: 'staff', sessionId: 'sess-1' });
    const next = vi.fn();
    await requirePermission('news.manage')(req, {} as Response, next as NextFunction);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 403 }));
  });

  it('lets the Owner role through even without the permission explicitly assigned', async () => {
    vi.mocked(getDatabase).mockReturnValue(
      fakeDbReturning([
        { subjectId: 'staff-1', ...liveSession(), status: 'active', roleId: 'owner-role-id', permissionKey: null },
      ]) as never,
    );
    const req = makeReq({ subjectId: 'staff-1', subjectType: 'staff', sessionId: 'sess-1' });
    const next = vi.fn();
    await requirePermission('settings.manage')(req, {} as Response, next as NextFunction);
    expect(next).toHaveBeenCalledWith();
    expect(req.staffRole).toEqual({ roleId: 'owner-role-id', isOwner: true });
  });

  it('gives no bypass to a role that merely shares a similar name, only the seeded id', async () => {
    vi.mocked(getDatabase).mockReturnValue(
      fakeDbReturning([
        { subjectId: 'staff-1', ...liveSession(), status: 'active', roleId: 'look-alike-owner-role-id', permissionKey: null },
      ]) as never,
    );
    const req = makeReq({ subjectId: 'staff-1', subjectType: 'staff', sessionId: 'sess-1' });
    const next = vi.fn();
    await requirePermission('settings.manage')(req, {} as Response, next as NextFunction);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 403 }));
  });

  it('rejects before evaluating the permission when a password change is pending', async () => {
    vi.mocked(getDatabase).mockReturnValue(
      fakeDbReturning([
        {
          subjectId: 'staff-1',
          ...liveSession(),
          status: 'active',
          roleId: 'editor-role-id',
          mustChangePassword: true,
          permissionKey: 'news.manage', // the caller DOES hold the permission being checked
        },
      ]) as never,
    );
    const req = makeReq({ subjectId: 'staff-1', subjectType: 'staff', sessionId: 'sess-1' });
    const next = vi.fn();
    await requirePermission('news.manage')(req, {} as Response, next as NextFunction);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 403, code: 'password_change_required' }));
  });

  it('gives the Owner role no bypass for a pending password change', async () => {
    vi.mocked(getDatabase).mockReturnValue(
      fakeDbReturning([
        {
          subjectId: 'staff-1',
          ...liveSession(),
          status: 'active',
          roleId: 'owner-role-id',
          mustChangePassword: true,
          permissionKey: null,
        },
      ]) as never,
    );
    const req = makeReq({ subjectId: 'staff-1', subjectType: 'staff', sessionId: 'sess-1' });
    const next = vi.fn();
    await requirePermission('settings.manage')(req, {} as Response, next as NextFunction);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 403, code: 'password_change_required' }));
  });
});

/**
 * These run against a **real Express app**, not hand-built objects shaped like one. The
 * previous fakes modelled the internals the walker reads, so they kept passing while the
 * walker missed real structures — a mounted sub-app's routes hang off `handle._router`, not
 * `handle.stack`, and the fakes never had a `_router` to miss. A test that asserts against a
 * model of Express can only ever verify the model.
 */
describe('auditAuthorizationDeclarations', () => {
  function undeclared(_req: Request, res: Response) {
    res.status(200).end();
  }

  it('passes when every route carries a declaration', () => {
    const app = express();
    app.get('/health', requirePublic(), undeclared);
    expect(() => auditAuthorizationDeclarations(app)).not.toThrow();
  });

  it('passes with ordinary global middleware mounted, which carries no declaration by design', () => {
    const app = express();
    app.use(express.json());
    app.use((_req: Request, _res: Response, next: NextFunction) => next());
    app.get('/health', requirePublic(), undeclared);
    expect(() => auditAuthorizationDeclarations(app)).not.toThrow();
  });

  it('throws when a route carries no declaration', () => {
    const app = express();
    app.get('/oops', undeclared);
    expect(() => auditAuthorizationDeclarations(app)).toThrow(/oops/);
  });

  it('walks into mounted sub-routers', () => {
    const app = express();
    const router = Router();
    router.post('/nested', undeclared);
    app.use('/parent', router);
    expect(() => auditAuthorizationDeclarations(app)).toThrow(/nested/);
  });

  it('recognizes a declaration on a router-level use(), not only on the route itself', () => {
    const app = express();
    const router = Router();
    router.use(requirePublic());
    router.get('/inherited', undeclared);
    app.use('/parent', router);
    expect(() => auditAuthorizationDeclarations(app)).not.toThrow();
  });

  /**
   * The hole the fakes could not see. Express wraps a mounted sub-app in a `mounted_app`
   * closure and keeps no reference to the app on the layer, so its routes cannot be reached
   * from the parent's table at all — the old walker skipped it and reported a clean boot,
   * meaning an entire application could be mounted and served with no declaration.
   * Un-introspectable has to mean rejected.
   */
  it('rejects a mounted sub-app, whose routes Express does not expose to the walker', () => {
    const app = express();
    const subApp = express();
    subApp.get('/inside-subapp', undeclared);
    app.use('/mounted', subApp);
    expect(() => auditAuthorizationDeclarations(app)).toThrow(/\/mounted/);
  });

  it('flags a path-mounted responding middleware, which is an endpoint with no declaration', () => {
    const app = express();
    app.use('/responds', undeclared);
    expect(() => auditAuthorizationDeclarations(app)).toThrow(/\/responds/);
  });

  it('does not flag a path-mounted error handler, which never serves a route', () => {
    const app = express();
    app.get('/fine', requirePublic(), undeclared);
    app.use('/scoped', (_err: unknown, _req: Request, _res: Response, _next: NextFunction) => {});
    expect(() => auditAuthorizationDeclarations(app)).not.toThrow();
  });

  it('fails closed on a layer shape it cannot introspect rather than assuming it is declared', () => {
    const app = { _router: { stack: [{ handle: 'not-a-function' }] } };
    expect(() => auditAuthorizationDeclarations(app)).toThrow(/unrecognized Express layer shape/);
  });

});
