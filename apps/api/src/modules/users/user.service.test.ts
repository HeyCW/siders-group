import { describe, expect, it, vi } from 'vitest';
import { createUserService } from './user.service.js';
import type { UserRepository } from './user.repository.js';

function makeRow() {
  return {
    id: 'staff-1',
    email: 'a@b.com',
    name: 'A',
    roleId: 'editor-role-id',
    roleName: 'Editor',
    status: 'active' as const,
    mustChangePassword: false,
    createdAt: new Date('2024-01-01'),
  };
}

/**
 * `permissionKeys`/`isOwner` are merged in from the caller's already-resolved `req.staffRole`,
 * not from a second `role_permissions` query (design.md - "not a second query"). Asserted here
 * against the repository mock directly: the repository's `findById` is called with no
 * knowledge of permissions at all, and the service is what stitches them onto the DTO.
 */
describe('UserService.getById', () => {
  it('merges the caller\'s access info onto the DTO without a second repository call', async () => {
    const findById = vi.fn().mockResolvedValue(makeRow());
    const service = createUserService({ findById } as UserRepository);

    const dto = await service.getById('staff-1', { permissionKeys: ['news.manage', 'article.publish'], isOwner: false });

    expect(findById).toHaveBeenCalledTimes(1);
    expect(dto).toMatchObject({
      id: 'staff-1',
      permissionKeys: ['news.manage', 'article.publish'],
      isOwner: false,
    });
  });

  it('reports Owner status even when no permission keys were resolved', async () => {
    const findById = vi.fn().mockResolvedValue(makeRow());
    const service = createUserService({ findById } as UserRepository);

    const dto = await service.getById('staff-1', { permissionKeys: [], isOwner: true });

    expect(dto).toMatchObject({ permissionKeys: [], isOwner: true });
  });

  it('returns null without merging access info when the account no longer exists', async () => {
    const findById = vi.fn().mockResolvedValue(null);
    const service = createUserService({ findById } as UserRepository);

    const dto = await service.getById('missing', { permissionKeys: ['news.manage'], isOwner: false });

    expect(dto).toBeNull();
  });

  it('leaks no other role/permission fields beyond permissionKeys and isOwner', async () => {
    const findById = vi.fn().mockResolvedValue(makeRow());
    const service = createUserService({ findById } as UserRepository);

    const dto = await service.getById('staff-1', { permissionKeys: ['news.manage'], isOwner: false });

    expect(Object.keys(dto ?? {}).sort()).toEqual(
      ['createdAt', 'email', 'id', 'isOwner', 'mustChangePassword', 'name', 'permissionKeys', 'roleId', 'roleName', 'status'].sort(),
    );
  });
});
