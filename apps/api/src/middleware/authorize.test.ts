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

  /**
   * The mute restricts *authoring*, and the request method is only a proxy for that. A route
   * where the two diverge — a profile update, say — says so rather than inheriting the guess.
   */
  it('lets a muted reader through a mutating route that declares it authors no content', async () => {
    vi.mocked(getDatabase).mockReturnValue(
      fakeDbReturning([
        { subjectId: 'reader-1', ...liveSession(), status: 'active', mutedUntil: new Date(Date.now() + 60_000) },
      ]) as never,
    );
    const req = { ...makeReq({ subjectId: 'reader-1', subjectType: 'reader', sessionId: 'sess-1' }), method: 'PATCH' } as Request;
    const next = vi.fn();
    await requireReader({ createsContent: false })(req, {} as Response, next as NextFunction);
    expect(next).toHaveBeenCalledWith();
  });

  it('rejects a muted reader at a read-method route that declares it authors content', async () => {
    vi.mocked(getDatabase).mockReturnValue(
      fakeDbReturning([
        { subjectId: 'reader-1', ...liveSession(), status: 'active', mutedUntil: new Date(Date.now() + 60_000) },
      ]) as never,
    );
    const next = vi.fn();
    const req = makeReq({ subjectId: 'reader-1', subjectType: 'reader', sessionId: 'sess-1' });
    await requireReader({ createsContent: true })(req, {} as Response, next as NextFunction);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 403, code: 'reader_muted' }));
  });

  /**
   * Ban is a comment-authoring sanction, not account termination (design.md - Decision 7,
   * `openspec/changes/add-community-moderation`): a banned reader's session stays usable
   * throughout, and a read-method request never even reaches the `createsContent` branch that
   * would reject them.
   */
  it('allows a banned reader through a read request', async () => {
    vi.mocked(getDatabase).mockReturnValue(
      fakeDbReturning([{ subjectId: 'reader-1', ...liveSession(), status: 'banned', mutedUntil: null }]) as never,
    );
    const next = vi.fn();
    const req = makeReq({ subjectId: 'reader-1', subjectType: 'reader', sessionId: 'sess-1' });
    await requireReader()(req, {} as Response, next as NextFunction);
    expect(next).toHaveBeenCalledWith();
  });

  it('allows a banned reader to like — declared createsContent: false, since a like authors no reader text', async () => {
    vi.mocked(getDatabase).mockReturnValue(
      fakeDbReturning([{ subjectId: 'reader-1', ...liveSession(), status: 'banned', mutedUntil: null }]) as never,
    );
    const req = { ...makeReq({ subjectId: 'reader-1', subjectType: 'reader', sessionId: 'sess-1' }), method: 'POST' } as Request;
    const next = vi.fn();
    await requireReader({ createsContent: false })(req, {} as Response, next as NextFunction);
    expect(next).toHaveBeenCalledWith();
  });

  it('rejects a banned reader at a content-creating endpoint', async () => {
    vi.mocked(getDatabase).mockReturnValue(
      fakeDbReturning([{ subjectId: 'reader-1', ...liveSession(), status: 'banned', mutedUntil: null }]) as never,
    );
    const req = { ...makeReq({ subjectId: 'reader-1', subjectType: 'reader', sessionId: 'sess-1' }), method: 'POST' } as Request;
    const next = vi.fn();
    await requireReader()(req, {} as Response, next as NextFunction);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 403, code: 'reader_banned' }));
  });

  it('rejects a banned reader at a read-method route explicitly declared to create content', async () => {
    vi.mocked(getDatabase).mockReturnValue(
      fakeDbReturning([{ subjectId: 'reader-1', ...liveSession(), status: 'banned', mutedUntil: null }]) as never,
    );
    const next = vi.fn();
    const req = makeReq({ subjectId: 'reader-1', subjectType: 'reader', sessionId: 'sess-1' });
    await requireReader({ createsContent: true })(req, {} as Response, next as NextFunction);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 403, code: 'reader_banned' }));
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
    expect(req.staffRole).toEqual({ roleId: 'author-role-id', isOwner: false, permissionKeys: [] });
  });

  /**
   * `GET /users/me` sources `permissionKeys` from `req.staffRole` rather than a second query
   * (specs/authorization/spec.md - "Effective permissions are reported") — this asserts the
   * value it reads actually matches the caller's role, not just that a field exists.
   */
  it('carries the caller\'s exact resolved permission keys on req.staffRole', async () => {
    vi.mocked(getDatabase).mockReturnValue(
      fakeDbReturning([
        { subjectId: 'staff-1', ...liveSession(), status: 'active', roleId: 'editor-role-id', permissionKey: 'news.manage' },
        { subjectId: 'staff-1', ...liveSession(), status: 'active', roleId: 'editor-role-id', permissionKey: 'article.publish' },
      ]) as never,
    );
    const req = makeReq({ subjectId: 'staff-1', subjectType: 'staff', sessionId: 'sess-1' });
    const next = vi.fn();
    await requireStaff()(req, {} as Response, next as NextFunction);
    expect(next).toHaveBeenCalledWith();
    expect(req.staffRole?.permissionKeys).toEqual(['news.manage', 'article.publish']);
  });

  /** specs/authorization/spec.md - "Owner status is reported independent of explicit permission
   *  rows": the Owner role satisfies every check regardless of what's actually assigned to it. */
  it('reports isOwner true for the Owner role even with zero explicit permission rows', async () => {
    vi.mocked(getDatabase).mockReturnValue(
      fakeDbReturning([
        { subjectId: 'staff-1', ...liveSession(), status: 'active', roleId: 'owner-role-id', permissionKey: null },
      ]) as never,
    );
    const req = makeReq({ subjectId: 'staff-1', subjectType: 'staff', sessionId: 'sess-1' });
    const next = vi.fn();
    await requireStaff()(req, {} as Response, next as NextFunction);
    expect(next).toHaveBeenCalledWith();
    expect(req.staffRole).toEqual({ roleId: 'owner-role-id', isOwner: true, permissionKeys: [] });
  });

  /** specs/authorization/spec.md - "A role or permission change is reflected on the next
   *  read": nothing here is cached — each request re-resolves from the database. */
  it('reflects a permission change on the very next request, with no caching in between', async () => {
    vi.mocked(getDatabase).mockReturnValueOnce(
      fakeDbReturning([
        { subjectId: 'staff-1', ...liveSession(), status: 'active', roleId: 'editor-role-id', permissionKey: 'news.manage' },
      ]) as never,
    );
    const firstReq = makeReq({ subjectId: 'staff-1', subjectType: 'staff', sessionId: 'sess-1' });
    await requireStaff()(firstReq, {} as Response, vi.fn() as NextFunction);
    expect(firstReq.staffRole?.permissionKeys).toEqual(['news.manage']);

    vi.mocked(getDatabase).mockReturnValueOnce(
      fakeDbReturning([
        { subjectId: 'staff-1', ...liveSession(), status: 'active', roleId: 'editor-role-id', permissionKey: 'news.manage' },
        { subjectId: 'staff-1', ...liveSession(), status: 'active', roleId: 'editor-role-id', permissionKey: 'article.publish' },
      ]) as never,
    );
    const secondReq = makeReq({ subjectId: 'staff-1', subjectType: 'staff', sessionId: 'sess-1' });
    await requireStaff()(secondReq, {} as Response, vi.fn() as NextFunction);
    expect(secondReq.staffRole?.permissionKeys).toEqual(['news.manage', 'article.publish']);
  });

  /**
   * The staff counterpart to the banned-reader case: a live session against a disabled
   * account. `disable` revokes sessions eagerly, but this is the check that holds if a row is
   * flipped out of band (specs/staff-account-management/spec.md - "Disabling revokes existing
   * sessions on the next request").
   */
  it('rejects a disabled staff account holding an otherwise-valid session', async () => {
    vi.mocked(getDatabase).mockReturnValue(
      fakeDbReturning([
        {
          subjectId: 'staff-1',
          ...liveSession(),
          status: 'disabled',
          roleId: 'editor-role-id',
          mustChangePassword: false,
          permissionKey: 'news.manage',
        },
      ]) as never,
    );
    const next = vi.fn();
    const req = makeReq({ subjectId: 'staff-1', subjectType: 'staff', sessionId: 'sess-1' });
    await requireStaff()(req, {} as Response, next as NextFunction);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 403, code: 'forbidden' }));
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
    expect(req.staffRole).toEqual({ roleId: 'owner-role-id', isOwner: true, permissionKeys: [] });
  });

  /** specs/authorization/spec.md - "Reported state does not change enforcement": a permission
   *  removed after being reported must reject on the very next request that needs it, exactly
   *  as if it had never been reported at all. */
  it('a permission removed after being reported no longer passes enforcement on the next request', async () => {
    vi.mocked(getDatabase).mockReturnValueOnce(
      fakeDbReturning([
        { subjectId: 'staff-1', ...liveSession(), status: 'active', roleId: 'editor-role-id', permissionKey: 'news.manage' },
      ]) as never,
    );
    const firstReq = makeReq({ subjectId: 'staff-1', subjectType: 'staff', sessionId: 'sess-1' });
    const firstNext = vi.fn();
    await requirePermission('news.manage')(firstReq, {} as Response, firstNext as NextFunction);
    expect(firstNext).toHaveBeenCalledWith();
    expect(firstReq.staffRole?.permissionKeys).toEqual(['news.manage']);

    // The permission is removed out of band between requests.
    vi.mocked(getDatabase).mockReturnValueOnce(
      fakeDbReturning([
        { subjectId: 'staff-1', ...liveSession(), status: 'active', roleId: 'editor-role-id', permissionKey: null },
      ]) as never,
    );
    const secondReq = makeReq({ subjectId: 'staff-1', subjectType: 'staff', sessionId: 'sess-1' });
    const secondNext = vi.fn();
    await requirePermission('news.manage')(secondReq, {} as Response, secondNext as NextFunction);
    expect(secondNext).toHaveBeenCalledWith(expect.objectContaining({ status: 403, code: 'forbidden' }));
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
