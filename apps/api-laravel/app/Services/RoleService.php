<?php

declare(strict_types=1);

namespace App\Services;

use App\Exceptions\CannotActOnSelfException;
use App\Exceptions\OwnerActionRequiresOwnerException;
use App\Exceptions\ReservedRoleSlugException;
use App\Exceptions\RoleConflictException;
use App\Exceptions\RoleInUseException;
use App\Exceptions\SystemRoleProtectedException;
use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class RoleService
{
    public function __construct(private readonly OwnerRoleResolver $ownerRoleResolver) {}

    /** @return Collection<int, Role> */
    public function listWithHolderCounts(): Collection
    {
        return Role::withCount('users')->orderBy('name')->get();
    }

    public function find(string $id): Role
    {
        return Role::with('permissions')->findOrFail($id);
    }

    public function create(string $name, array $permissionKeys): Role
    {
        $slug = $this->slugFor($name);

        if (Role::where('name', $name)->orWhere('slug', $slug)->exists()) {
            throw new RoleConflictException();
        }

        return DB::transaction(function () use ($name, $slug, $permissionKeys) {
            $role = Role::create(['name' => $name, 'slug' => $slug, 'is_system' => false]);
            $role->permissions()->sync($this->permissionIdsFor($permissionKeys));

            return $role;
        });
    }

    public function update(Role $role, ?string $name, ?array $permissionKeys): Role
    {
        return DB::transaction(function () use ($role, $name, $permissionKeys) {
            if ($name !== null && $name !== $role->name) {
                $slug = $this->slugFor($name);

                if (Role::where('id', '!=', $role->id)
                    ->where(fn ($q) => $q->where('name', $name)->orWhere('slug', $slug))
                    ->exists()
                ) {
                    throw new RoleConflictException();
                }

                $role->update(['name' => $name, 'slug' => $slug]);
            }

            if ($permissionKeys !== null) {
                if ($role->is_system && ! in_array('role.manage', $permissionKeys, true)) {
                    throw new SystemRoleProtectedException("The system role must always retain 'role.manage'.");
                }

                $role->permissions()->sync($this->permissionIdsFor($permissionKeys));
            }

            return $role->fresh('permissions');
        });
    }

    public function delete(Role $role): void
    {
        if ($role->is_system) {
            throw new SystemRoleProtectedException('The system role cannot be deleted.');
        }

        if ($role->users()->exists()) {
            throw new RoleInUseException();
        }

        $role->delete();
    }

    /**
     * Assigning or removing the Owner role, in either direction, requires the acting staff
     * member already be Owner — prevents a non-Owner with `user.manage` from promoting
     * themselves (or anyone) to Owner, and from demoting the last Owner.
     */
    public function assign(User $actor, User $target, Role $role): void
    {
        if ($actor->id === $target->id) {
            throw new CannotActOnSelfException('You cannot reassign your own role.');
        }

        $ownerRoleId = $this->ownerRoleResolver->id();
        $touchesOwner = $role->id === $ownerRoleId || $target->role_id === $ownerRoleId;

        if ($touchesOwner && ! $this->ownerRoleResolver->isOwner($actor->role_id)) {
            throw new OwnerActionRequiresOwnerException();
        }

        $target->update(['role_id' => $role->id]);
    }

    private function slugFor(string $name): string
    {
        $slug = Str::slug($name);

        if ($slug === 'owner') {
            throw new ReservedRoleSlugException();
        }

        return $slug;
    }

    /** @param array<int, string> $keys */
    private function permissionIdsFor(array $keys): array
    {
        return Permission::whereIn('key', $keys)->pluck('id')->all();
    }
}
