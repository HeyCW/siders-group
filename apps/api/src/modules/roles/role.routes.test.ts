import { beforeEach, describe, expect, it, vi } from 'vitest';
import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';
import { createErrorHandler } from '../../middleware/errorHandler.js';
import type { Logger } from '../../lib/logger.js';
import type { Database } from '@siders/db';
import { fakeStaffAccessDbReturning as fakeAuthDbReturning } from '../../testing/fakeStaffAccessDb.js';

vi.mock('../../lib/db.js', () => ({ getDatabase: vi.fn() }));
vi.mock('../../config/env.js', () => ({ loadEnv: vi.fn().mockReturnValue({}) }));
vi.mock('../../lib/ownerRole.js', () => ({ getOwnerRoleId: vi.fn().mockResolvedValue('owner-role-id') }));

/**
 * A minimal stand-in for the repository's own `Database` handle — every chain method returns
 * itself and the chain resolves to `[]`. Sufficient for this file's one concern (route
 * registration order), which never depends on what the repository's queries actually return.
 */
function fakeRepoDb(): Database {
  const builder: Record<string, unknown> = {};
  const self = () => builder;
  Object.assign(builder, {
    select: self,
    from: self,
    where: self,
    limit: self,
    leftJoin: self,
    innerJoin: self,
    groupBy: self,
    then: (resolve: (v: unknown[]) => void) => resolve([]),
  });
  return builder as unknown as Database;
}

import { getDatabase } from '../../lib/db.js';
import { roleRoutes } from './role.routes.js';

const silentLogger = { warn() {}, error() {}, info() {} } as unknown as Logger;
const HOUR_MS = 60 * 60 * 1000;

function liveSession() {
  return {
    revokedAt: null,
    expiresAt: new Date(Date.now() + HOUR_MS),
    absoluteExpiresAt: new Date(Date.now() + 24 * HOUR_MS),
  };
}

function withAuth(auth: { subjectId: string; subjectType: 'staff'; sessionId: string }) {
  return { 'x-test-auth': JSON.stringify(auth) };
}

function createApp(): Express {
  const app = express();
  app.use(express.json());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    const header = req.header('x-test-auth');
    if (header) req.auth = JSON.parse(header);
    next();
  });
  app.use('/roles', roleRoutes(fakeRepoDb()));
  app.use(createErrorHandler(silentLogger));
  return app;
}

/**
 * `GET /roles/permissions` must resolve to the permission catalog, never to the `GET /:id`
 * detail route matching `"permissions"` as a uuid path param — a hazard `design.md` calls out
 * explicitly ("Route ordering hazard") because Express matches routes in registration order and
 * `/:id` would otherwise shadow the literal `/permissions` segment.
 */
describe('role routes registration order', () => {
  let app: Express;

  beforeEach(() => {
    app = createApp();
    vi.mocked(getDatabase).mockReturnValue(
      fakeAuthDbReturning([
        { subjectId: 'staff-1', ...liveSession(), status: 'active', roleId: 'admin-role-id', permissionKey: 'role.manage' },
      ]) as never,
    );
  });

  it('resolves GET /roles/permissions to the catalog, not the invalid-id rejection /:id would produce', async () => {
    const res = await request(app)
      .get('/roles/permissions')
      .set(withAuth({ subjectId: 'staff-1', subjectType: 'staff', sessionId: 'sess-1' }));

    expect(res.status).not.toBe(400);
    expect(res.body).toMatchObject({ success: true, data: [] });
  });
});
