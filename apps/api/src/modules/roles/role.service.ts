import type { Database } from '@siders/db';
import { AppError } from '../../middleware/errorHandler.js';
import { getOwnerRoleId } from '../../lib/ownerRole.js';
import type { CallerContext } from '../../lib/callerContext.js';
import type { PermissionCatalogEntry, RoleRepository, RoleSummaryRow, RoleWithPermissions } from './role.repository.js';

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
  list(): Promise<RoleSummaryRow[]>;
  findDetail(id: string): Promise<RoleWithPermissions & { holderCount: number }>;
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
    list() {
      return repository.listWithHolderCounts();
    },

    async findDetail(id) {
      const role = await repository.findById(id);
      if (!role) {
        throw new AppError('Role not found', 404, 'not_found');
      }
      // Single row, so a direct count here is not the N+1 `listWithHolderCounts` exists to
      // avoid (design.md - "Summary list, detail on demand").
      const holderCount = await repository.countStaffWithRole(id);
      return { ...role, holderCount };
    },

    listPermissionCatalog() {
      return repository.listCatalogPermissions();
    },

    async create(input) {
      // `permissions` is already restricted to the catalog by `roleCreateRequestSchema`
      // (a Zod enum of PERMISSION_KEYS) before this ever runs.
      const slug = await assertUsableName(input.name);
      // Two distinct names ("Content Editor" and "content editor") slugify identically; without
      // this the unique constraint surfaces as a 500 instead of a 409.
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
      let slug: string | undefined;
      if (input.name !== undefined) {
        // The slug is recomputed with the name and written alongside it. Leaving it behind made
        // it a stale record of what the role used to be called: renaming "Editor" to "Publisher"
        // kept slug `editor`, so a later, legitimate role named "Editor" collided on `findBySlug`
        // and was rejected as a duplicate of a name no role held any more.
        slug = await assertUsableName(input.name, id);
        const slugHolder = await repository.findBySlug(slug);
        if (slugHolder && slugHolder.id !== id) {
          throw duplicateNameError();
        }
      }
      if (role.isSystem && input.permissions !== undefined && !input.permissions.includes('role.manage')) {
        throw new AppError('Cannot remove role management from the Owner role', 403, 'owner_role_protected');
      }
      return repository.update(id, { name: input.name, slug, permissionKeys: input.permissions });
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
      const currentRoleId = await repository.findAssignedRoleId(targetStaffId);
      if (currentRoleId === null) {
        throw new AppError('Staff member not found', 404, 'not_found');
      }
      const ownerRoleId = await getOwnerRoleId(db);
      if (roleId === ownerRoleId && !caller.isOwner) {
        throw new AppError('Only an Owner may assign the Owner role', 403, 'forbidden');
      }
      // Removing Owner is as privileged as granting it. Guarding only the role being *assigned*
      // left the mirror-image door open: a non-Owner holding `role.manage` could assign an
      // ordinary role to the last Owner, after which nobody holds Owner and nobody can grant it
      // back, because granting requires already holding it. That is not escalation — it is
      // permanent loss of role administration, recoverable only by editing the database. It also
      // falsified design.md's claim that "at least one active Owner always survives the API's own
      // operations", which held for disable and self-mutation but never for reassignment.
      if (currentRoleId === ownerRoleId && !caller.isOwner) {
        throw new AppError('Only an Owner may change the role assigned to an Owner', 403, 'forbidden');
      }
      const assigned = await repository.assignRole(targetStaffId, roleId);
      if (!assigned) {
        // The target existed a moment ago, so it was deleted mid-request. Still a 404, never a
        // silent 204 reporting an assignment that did not happen.
        throw new AppError('Staff member not found', 404, 'not_found');
      }
    },
  };
}
