<?php

declare(strict_types=1);

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Services\SessionRevocationService;
use App\Services\StaffAuthService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class StaffAuthController extends Controller
{
    public function __construct(
        private readonly StaffAuthService $staffAuthService,
        private readonly SessionRevocationService $sessionRevocationService,
    ) {}

    public function login(Request $request): JsonResponse
    {
        $credentials = $request->validate([
            'email' => ['required', 'email'],
            'password' => ['required', 'string'],
        ]);

        $user = $this->staffAuthService->attempt($credentials['email'], $credentials['password']);

        if ($user === null) {
            return response()->json([
                'error' => ['code' => 'invalid_credentials', 'message' => 'Invalid email or password.'],
            ], 401);
        }

        Auth::guard('staff')->login($user);
        $request->session()->regenerate();
        $this->sessionRevocationService->bindCurrentSession($request, $user->id);

        return response()->json(['data' => [
            'id' => $user->id,
            'email' => $user->email,
            'name' => $user->name,
            'mustChangePassword' => $user->must_change_password,
        ]]);
    }

    public function logout(Request $request): JsonResponse
    {
        Auth::guard('staff')->logout();
        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return response()->json(['data' => null]);
    }
}
