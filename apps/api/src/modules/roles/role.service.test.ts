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
  rows.set('unheld-role-id', {
    id: 'unheld-role-id',
    name: 'Unheld',
    slug: 'unheld',
    isSystem: false,
    permissions: [],
  });

  const staffRoleCounts = new Map<string, number>();
  /** Stands in for the staff table: staff id -> the role that staff member currently holds. */
  const staffRoles = new Map<string, string>([
    ['target-1', 'editor-role-id'],
    ['owner-target', 'owner-role-id'],
  ]);

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
    async listWithHolderCounts() {
      return [...rows.values()].map((row) => ({
        id: row.id,
        name: row.name,
        slug: row.slug,
        isSystem: row.isSystem,
        holderCount: [...staffRoles.values()].filter((roleId) => roleId === row.id).length,
      }));
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
      // Mirrors the real repository: the slug is rewritten with the name, never left behind.
      if (input.slug !== undefined) row.slug = input.slug;
      if (input.permissionKeys !== undefined) row.permissions = input.permissionKeys;
      return row;
    },
    async delete(id) {
      rows.delete(id);
    },
    async countStaffWithRole(id) {
      // An explicit override (used by the "role still in use" tests) wins; otherwise derive
      // from `staffRoles`, the same source `listWithHolderCounts` reads, so the two stay
      // consistent for roles nobody set an override for.
      return staffRoleCounts.get(id) ?? [...staffRoles.values()].filter((roleId) => roleId === id).length;
    },
    async findAssignedRoleId(staffId) {
      return staffRoles.get(staffId) ?? null;
    },
    async assignRole(staffId, roleId) {
      if (!staffRoles.has(staffId)) return false;
      staffRoles.set(staffId, roleId);
      return true;
    },
  };

  return { repository, rows, staffRoleCounts, staffRoles };
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

  /**
   * The mirror image of "only an Owner may grant Owner", and the door that was left open:
   * removing Owner was unguarded. A non-Owner holding `role.manage` could assign an ordinary
   * role to the last Owner, after which nobody holds Owner and nobody can grant it back —
   * granting requires already holding it. Not escalation, but permanent loss of role
   * administration, recoverable only by editing the database.
   */
  it('rejects a non-Owner caller demoting an Owner, which would strip Owner from the system', async () => {
    await expect(
      service.assign('owner-target', 'editor-role-id', { subjectId: 'caller-1', isOwner: false }),
    ).rejects.toMatchObject({ status: 403, code: 'forbidden' });

    // The Owner still holds Owner — the write never happened.
    expect(fake.staffRoles.get('owner-target')).toBe('owner-role-id');
  });

  it('allows an Owner caller to change another Owner’s role', async () => {
    await expect(
      service.assign('owner-target', 'editor-role-id', { subjectId: 'owner-caller', isOwner: true }),
    ).resolves.toBeUndefined();
    expect(fake.staffRoles.get('owner-target')).toBe('editor-role-id');
  });

  /**
   * A `roleId` that matches no role is rejected by the FK; a `staffId` that matches no staff
   * member was not rejected by anything. The UPDATE simply matched zero rows and the endpoint
   * answered 204, reporting success for an assignment that never happened.
   */
  it('rejects assigning a role to a staff id that matches no account', async () => {
    await expect(
      service.assign('ghost-1', 'editor-role-id', { subjectId: 'caller-1', isOwner: false }),
    ).rejects.toMatchObject({ status: 404, code: 'not_found' });
  });

  /**
   * The slug used to be written once at creation and never again, so it drifted into a record
   * of what the role was previously called — and went on colliding under the old name.
   */
  it('rewrites the slug when the name changes, freeing the old name for reuse', async () => {
    const created = await service.create({ name: 'Editor', permissions: [] });
    expect(created.slug).toBe('editor');

    const renamed = await service.update(created.id, { name: 'Publisher' });
    expect(renamed.slug).toBe('publisher');

    // No role is named or slugged "Editor" any more, so creating one must succeed rather than
    // collide with the renamed role's stale slug.
    await expect(service.create({ name: 'Editor', permissions: [] })).resolves.toMatchObject({
      name: 'Editor',
      slug: 'editor',
    });
  });

  it('still rejects a rename whose slug collides with another live role', async () => {
    await service.create({ name: 'Editor', permissions: [] });
    const other = await service.create({ name: 'Reviewer', permissions: [] });

    await expect(service.update(other.id, { name: 'editor' })).rejects.toMatchObject({
      status: 409,
      code: 'role_name_exists',
    });
  });

  // specs/rbac-management/spec.md - "A role with no holders still appears".
  it('includes a role no staff member holds, with a holder count of zero', async () => {
    const list = await service.list();
    const unheld = list.find((r) => r.id === 'unheld-role-id');
    expect(unheld).toMatchObject({ holderCount: 0 });
  });

  it('reports a non-zero holder count for a role staff members currently hold', async () => {
    const list = await service.list();
    const owner = list.find((r) => r.id === 'owner-role-id');
    // `target-1` and `owner-target` both hold roles in `staffRoles`; only `owner-target` holds Owner.
    expect(owner).toMatchObject({ holderCount: 1 });
  });

  it('reads a role together with its permissions and holder count', async () => {
    const detail = await service.findDetail('owner-role-id');
    expect(detail).toMatchObject({
      id: 'owner-role-id',
      permissions: ['role.manage', 'user.manage', 'news.manage'],
      holderCount: 1,
    });
  });

  it('rejects reading a role that does not exist', async () => {
    await expect(service.findDetail('does-not-exist')).rejects.toMatchObject({ status: 404, code: 'not_found' });
  });
});
