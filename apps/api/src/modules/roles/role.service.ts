import type { Database } from '@siders/db';
import { AppError } from '../../middleware/errorHandler.js';
import { getOwnerRoleId } from '../../lib/ownerRole.js';
import type { CallerContext } from '../../lib/callerContext.js';
import type { PermissionCatalogEntry, RoleRepository, RoleWithPermissions } from './role.repository.js';

const RESERVED_OWNER_SLUG = 'owner';

function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function reservedIdentityError(): AppError {
  return new AppError('This role name is reserved for the Owner role', 409, 'reserved_role_identity');
}

export interface RoleService {
  listPermissionCatalog(): Promise<PermissionCatalogEntry[]>;
  create(input: { name: string; permissions: string[] }): Promise<RoleWithPermissions>;
  update(
    id: string,
    input: { name?: string | undefined; permissions?: string[] | undefined },
  ): Promise<RoleWithPermissions>;
  delete(id: string): Promise<void>;
  assign(targetStaffId: string, roleId: string, caller: CallerContext): Promise<void>;
}

function duplicateNameError(): AppError {
  return new AppError('A role with this name already exists', 409, 'role_name_exists');
}

export function createRoleService(db: Database, repository: RoleRepository): RoleService {
  /** Validates the name and returns the slug it resolves to. */
  async function assertUsableName(name: string, excludeRoleId?: string): Promise<string> {
    const slug = slugify(name);
    if (!slug) {
      throw new AppError('Role name must contain at least one letter or number', 400, 'invalid_role_name');
    }
    if (slug === RESERVED_OWNER_SLUG) {
      throw reservedIdentityError();
    }
    const existing = await repository.findByName(name);
    if (existing && existing.id !== excludeRoleId) {
      throw duplicateNameError();
    }
    return slug;
  }

  return {
    listPermissionCatalog() {
      return repository.listCatalogPermissions();
    },

    async create(input) {
      // `permissions` is already restricted to the catalog by `roleCreateRequestSchema`
      // (a Zod enum of PERMISSION_KEYS) before this ever runs.
      const slug = await assertUsableName(input.name);
      // `update` never rewrites a slug, so create is the only path that can collide on one.
      // Two distinct names ("Content Editor" and "content editor") slugify identically;
      // without this the unique constraint surfaces as a 500 instead of a 409.
      if (await repository.findBySlug(slug)) {
        throw duplicateNameError();
      }
      return repository.create({ name: input.name, slug, permissionKeys: input.permissions });
    },

    async update(id, input) {
      const role = await repository.findById(id);
      if (!role) {
        throw new AppError('Role not found', 404, 'not_found');
      }
      if (input.name !== undefined) {
        await assertUsableName(input.name, id);
      }
      if (role.isSystem && input.permissions !== undefined && !input.permissions.includes('role.manage')) {
        throw new AppError('Cannot remove role management from the Owner role', 403, 'owner_role_protected');
      }
      return repository.update(id, { name: input.name, permissionKeys: input.permissions });
    },

    async delete(id) {
      const role = await repository.findById(id);
      if (!role) {
        throw new AppError('Role not found', 404, 'not_found');
      }
      if (role.isSystem) {
        throw new AppError('The Owner role cannot be deleted', 403, 'owner_role_protected');
      }
      const staffCount = await repository.countStaffWithRole(id);
      if (staffCount > 0) {
        throw new AppError('Role is still assigned to staff members', 409, 'role_in_use');
      }
      await repository.delete(id);
    },

    async assign(targetStaffId, roleId, caller) {
      if (targetStaffId === caller.subjectId) {
        throw new AppError('You cannot change the role assigned to your own account', 400, 'self_reassignment_forbidden');
      }
      const ownerRoleId = await getOwnerRoleId(db);
      if (roleId === ownerRoleId && !caller.isOwner) {
        throw new AppError('Only an Owner may assign the Owner role', 403, 'forbidden');
      }
      await repository.assignRole(targetStaffId, roleId);
    },
  };
}
