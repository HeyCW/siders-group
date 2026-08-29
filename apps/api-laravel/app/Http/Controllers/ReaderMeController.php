<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class ReaderMeController extends Controller
{
    public function show(Request $request): JsonResponse
    {
        $reader = $request->user('reader');

        return response()->json(['data' => [
            'id' => $reader->id,
            'name' => $reader->name,
            'email' => $reader->email,
            'avatarUrl' => $reader->avatar_url,
        ]]);
    }

    public function logout(Request $request): JsonResponse
    {
        Auth::guard('reader')->logout();
        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return response()->json(['data' => null]);
    }
}
