import { describe, expect, it, vi } from 'vitest';
import type { NextFunction, Request, Response } from 'express';
import { createUserController } from './user.controller.js';
import type { UserService } from './user.service.js';

function makeRes() {
  return { json: vi.fn() } as unknown as Response & { json: ReturnType<typeof vi.fn> };
}

/**
 * `getMe` sources `permissionKeys`/`isOwner` from `req.staffRole` — populated by `requireStaff`
 * from the same `resolveStaffAccess` call it already made — rather than issuing a second query
 * (design.md - "sources permissionKeys/isOwner from req.staffRole, not a second query").
 */
describe('userController.getMe', () => {
  it('passes req.staffRole\'s permissionKeys and isOwner through to the service', async () => {
    const getById = vi.fn().mockResolvedValue({ id: 'staff-1' });
    const controller = createUserController({ getById } as UserService);
    const req = {
      auth: { subjectId: 'staff-1', subjectType: 'staff', sessionId: 'sess-1' },
      staffRole: { roleId: 'editor-role-id', isOwner: false, permissionKeys: ['news.manage'] },
    } as unknown as Request;
    const res = makeRes();
    const next = vi.fn();

    await controller.getMe(req, res, next as NextFunction);

    expect(getById).toHaveBeenCalledWith('staff-1', { permissionKeys: ['news.manage'], isOwner: false });
    expect(next).not.toHaveBeenCalled();
  });

  it('defaults to no permissions and isOwner false when req.staffRole is absent', async () => {
    const getById = vi.fn().mockResolvedValue({ id: 'staff-1' });
    const controller = createUserController({ getById } as UserService);
    const req = { auth: { subjectId: 'staff-1', subjectType: 'staff', sessionId: 'sess-1' } } as unknown as Request;
    const res = makeRes();
    const next = vi.fn();

    await controller.getMe(req, res, next as NextFunction);

    expect(getById).toHaveBeenCalledWith('staff-1', { permissionKeys: [], isOwner: false });
  });
});
