import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../lib/ownerRole.js', () => ({
  getOwnerRoleId: vi.fn().mockResolvedValue('owner-role-id'),
}));

import { createRoleService } from './role.service.js';
import type { CreateRoleInput, RoleRepository, RoleWithPermissions, UpdateRoleInput } from './role.repository.js';

function createFakeRoleRepository() {
  const rows = new Map<string, RoleWithPermissions>();
  rows.set('owner-role-id', {
    id: 'owner-role-id',
    name: 'Owner',
    slug: 'owner',
    isSystem: true,
    permissions: ['role.manage', 'user.manage', 'news.manage'],
  });

  const staffRoleCounts = new Map<string, number>();

  const repository: RoleRepository = {
    async findByName(name) {
      for (const row of rows.values()) if (row.name === name) return row;
      return null;
    },
    async findBySlug(slug) {
      for (const row of rows.values()) if (row.slug === slug) return row;
      return null;
    },
    async findById(id) {
      return rows.get(id) ?? null;
    },
    async listCatalogPermissions() {
      return [
        { key: 'news.manage', description: 'Manage news' },
        { key: 'role.manage', description: 'Manage roles' },
      ];
    },
    async create(input: CreateRoleInput) {
      const row: RoleWithPermissions = {
        id: randomUUID(),
        name: input.name,
        slug: input.slug,
        isSystem: false,
        permissions: input.permissionKeys,
      };
      rows.set(row.id, row);
      return row;
    },
    async update(id, input: UpdateRoleInput) {
      const row = rows.get(id);
      if (!row) throw new Error('not found');
      if (input.name !== undefined) row.name = input.name;
      if (input.permissionKeys !== undefined) row.permissions = input.permissionKeys;
      return row;
    },
    async delete(id) {
      rows.delete(id);
    },
    async countStaffWithRole(id) {
      return staffRoleCounts.get(id) ?? 0;
    },
    async assignRole() {
      // no staff table in this fake; assignment success is asserted via no-throw
    },
  };

  return { repository, rows, staffRoleCounts };
}

describe('RoleService', () => {
  let fake: ReturnType<typeof createFakeRoleRepository>;
  let service: ReturnType<typeof createRoleService>;

  beforeEach(() => {
    fake = createFakeRoleRepository();
    service = createRoleService({} as never, fake.repository);
  });

  it('creates a role with a unique name', async () => {
    const role = await service.create({ name: 'Editor', permissions: ['news.manage'] });
    expect(role.name).toBe('Editor');
    expect(role.slug).toBe('editor');
  });

  it('rejects creating a role with a duplicate name', async () => {
    await service.create({ name: 'Editor', permissions: [] });
    await expect(service.create({ name: 'Editor', permissions: [] })).rejects.toMatchObject({
      status: 409,
      code: 'role_name_exists',
    });
  });

  it('rejects a distinct name that resolves to an existing role’s slug', async () => {
    await service.create({ name: 'Content Editor', permissions: [] });
    // Different name, same slug — the unique constraint would otherwise surface as a 500.
    await expect(service.create({ name: 'content editor', permissions: [] })).rejects.toMatchObject({
      status: 409,
      code: 'role_name_exists',
    });
  });

  it('rejects a name that resolves to no slug at all', async () => {
    await expect(service.create({ name: '!!!', permissions: [] })).rejects.toMatchObject({
      status: 400,
      code: 'invalid_role_name',
    });
  });

  it('rejects creating a role whose name resolves to the reserved Owner identity', async () => {
    await expect(service.create({ name: 'Owner', permissions: [] })).rejects.toMatchObject({
      status: 409,
      code: 'reserved_role_identity',
    });
    await expect(service.create({ name: '  owner  ', permissions: [] })).rejects.toMatchObject({
      code: 'reserved_role_identity',
    });
  });

  it('rejects renaming a role onto the reserved Owner identity', async () => {
    const role = await service.create({ name: 'Editor', permissions: [] });
    await expect(service.update(role.id, { name: 'Owner' })).rejects.toMatchObject({
      code: 'reserved_role_identity',
    });
  });

  it('rejects removing role.manage from the Owner role', async () => {
    await expect(
      service.update('owner-role-id', { permissions: ['user.manage'] }),
    ).rejects.toMatchObject({ status: 403, code: 'owner_role_protected' });
  });

  it('allows updating the Owner role as long as role.manage stays', async () => {
    const updated = await service.update('owner-role-id', { permissions: ['role.manage', 'user.manage'] });
    expect(updated.permissions).toContain('role.manage');
  });

  it('rejects deleting the Owner role', async () => {
    await expect(service.delete('owner-role-id')).rejects.toMatchObject({
      status: 403,
      code: 'owner_role_protected',
    });
  });

  it('rejects deleting a role still assigned to staff', async () => {
    const role = await service.create({ name: 'Editor', permissions: [] });
    fake.staffRoleCounts.set(role.id, 2);
    await expect(service.delete(role.id)).rejects.toMatchObject({ status: 409, code: 'role_in_use' });
  });

  it('deletes an unassigned, non-system role', async () => {
    const role = await service.create({ name: 'Editor', permissions: [] });
    await service.delete(role.id);
    expect(fake.rows.has(role.id)).toBe(false);
  });

  it('rejects a staff member reassigning their own role', async () => {
    await expect(
      service.assign('caller-1', 'some-role-id', { subjectId: 'caller-1', isOwner: false }),
    ).rejects.toMatchObject({ status: 400, code: 'self_reassignment_forbidden' });
  });

  it('rejects a non-Owner caller assigning the Owner role', async () => {
    await expect(
      service.assign('target-1', 'owner-role-id', { subjectId: 'caller-1', isOwner: false }),
    ).rejects.toMatchObject({ status: 403 });
  });

  it('allows an Owner caller to assign the Owner role', async () => {
    await expect(
      service.assign('target-1', 'owner-role-id', { subjectId: 'caller-1', isOwner: true }),
    ).resolves.toBeUndefined();
  });

  it('allows assigning a non-Owner role regardless of caller', async () => {
    await expect(
      service.assign('target-1', 'editor-role-id', { subjectId: 'caller-1', isOwner: false }),
    ).resolves.toBeUndefined();
  });
});
