<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Http\Requests\Staff\StoreStaffRequest;
use App\Models\Role;
use App\Models\User;
use App\Services\StaffAccountService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class StaffAccountController extends Controller
{
    public function __construct(private readonly StaffAccountService $staffAccountService) {}

    public function index(): JsonResponse
    {
        $staff = $this->staffAccountService->list();

        return response()->json(['data' => $staff->map(fn (User $u) => $this->summary($u))]);
    }

    public function store(StoreStaffRequest $request): JsonResponse
    {
        $role = Role::findOrFail($request->input('roleId'));

        $result = $this->staffAccountService->create(
            $request->user('staff'),
            $request->string('email')->value(),
            $request->string('name')->value(),
            $role,
        );

        return response()->json(['data' => [
            ...$this->summary($result['user']),
            'temporaryPassword' => $result['temporaryPassword'],
        ]], 201);
    }

    public function disable(Request $request, string $id): JsonResponse
    {
        $target = User::findOrFail($id);
        $this->staffAccountService->disable($request->user('staff'), $target);

        return response()->json(['data' => null]);
    }

    public function reset(Request $request, string $id): JsonResponse
    {
        $target = User::findOrFail($id);
        $result = $this->staffAccountService->reset($request->user('staff'), $target);

        return response()->json(['data' => [
            ...$this->summary($result['user']),
            'temporaryPassword' => $result['temporaryPassword'],
        ]]);
    }

    private function summary(User $user): array
    {
        return [
            'id' => $user->id,
            'email' => $user->email,
            'name' => $user->name,
            'roleId' => $user->role_id,
            'status' => $user->status,
            'mustChangePassword' => $user->must_change_password,
        ];
    }
}
