<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Http\Requests\Staff\ChangeOwnPasswordRequest;
use App\Services\OwnerRoleResolver;
use App\Services\StaffAccountService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class StaffMeController extends Controller
{
    public function __construct(
        private readonly StaffAccountService $staffAccountService,
        private readonly OwnerRoleResolver $ownerRoleResolver,
    ) {}

    /**
     * Sourced from the already-loaded role/permissions on the authenticated request (no second
     * permissions query) — mirrors the Node app's `req.staffRole` reuse in this same endpoint.
     */
    public function show(Request $request): JsonResponse
    {
        $staff = $request->user('staff')->load('role.permissions');

        return response()->json(['data' => [
            'id' => $staff->id,
            'email' => $staff->email,
            'name' => $staff->name,
            'roleId' => $staff->role_id,
            'mustChangePassword' => $staff->must_change_password,
            'isOwner' => $this->ownerRoleResolver->isOwner($staff->role_id),
            'permissionKeys' => $staff->role->permissions->pluck('key')->values(),
        ]]);
    }

    public function changePassword(ChangeOwnPasswordRequest $request): JsonResponse
    {
        $this->staffAccountService->changeOwnPassword(
            $request->user('staff'),
            $request->string('currentPassword')->value(),
            $request->string('newPassword')->value(),
            $request->session()->getId(),
        );

        return response()->json(['data' => null]);
    }
}
