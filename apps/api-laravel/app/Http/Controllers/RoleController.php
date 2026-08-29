<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Http\Requests\Role\AssignRoleRequest;
use App\Http\Requests\Role\StoreRoleRequest;
use App\Http\Requests\Role\UpdateRoleRequest;
use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use App\Services\RoleService;
use Illuminate\Http\JsonResponse;

class RoleController extends Controller
{
    public function __construct(private readonly RoleService $roleService) {}

    public function permissions(): JsonResponse
    {
        return response()->json(['data' => Permission::orderBy('key')->get(['id', 'key', 'description'])]);
    }

    public function index(): JsonResponse
    {
        $roles = $this->roleService->listWithHolderCounts();

        return response()->json(['data' => $roles->map(fn (Role $role) => [
            'id' => $role->id,
            'name' => $role->name,
            'slug' => $role->slug,
            'isSystem' => $role->is_system,
            'holderCount' => $role->users_count,
        ])]);
    }

    public function show(string $id): JsonResponse
    {
        $role = $this->roleService->find($id);

        return response()->json(['data' => $this->detail($role)]);
    }

    public function store(StoreRoleRequest $request): JsonResponse
    {
        $role = $this->roleService->create($request->string('name')->value(), $request->input('permissionKeys'));

        return response()->json(['data' => $this->detail($role->fresh('permissions'))], 201);
    }

    public function update(UpdateRoleRequest $request, string $id): JsonResponse
    {
        $role = Role::findOrFail($id);
        $role = $this->roleService->update(
            $role,
            $request->has('name') ? $request->string('name')->value() : null,
            $request->has('permissionKeys') ? $request->input('permissionKeys') : null,
        );

        return response()->json(['data' => $this->detail($role)]);
    }

    public function destroy(string $id): JsonResponse
    {
        $this->roleService->delete(Role::findOrFail($id));

        return response()->json(['data' => null]);
    }

    public function assign(AssignRoleRequest $request, string $staffId): JsonResponse
    {
        $target = User::findOrFail($staffId);
        $role = Role::findOrFail($request->input('roleId'));

        $this->roleService->assign($request->user('staff'), $target, $role);

        return response()->json(['data' => null]);
    }

    private function detail(Role $role): array
    {
        return [
            'id' => $role->id,
            'name' => $role->name,
            'slug' => $role->slug,
            'isSystem' => $role->is_system,
            'permissionKeys' => $role->permissions->pluck('key')->values(),
        ];
    }
}
