<?php

declare(strict_types=1);

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Services\ReaderAuthService;
use App\Services\SessionRevocationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Laravel\Socialite\Facades\Socialite;

class GoogleAuthController extends Controller
{
    public function __construct(
        private readonly ReaderAuthService $readerAuthService,
        private readonly SessionRevocationService $sessionRevocationService,
    ) {}

    public function redirect(): RedirectResponse
    {
        return Socialite::driver('google')
            ->scopes(['openid', 'email', 'profile'])
            ->redirect();
    }

    public function callback(Request $request): JsonResponse
    {
        $googleUser = Socialite::driver('google')->user();

        $reader = $this->readerAuthService->findOrCreateFromGoogle($googleUser);

        Auth::guard('reader')->login($reader);
        $request->session()->regenerate();
        $this->sessionRevocationService->bindCurrentSession($request, $reader->id);

        return response()->json(['data' => [
            'id' => $reader->id,
            'name' => $reader->name,
            'email' => $reader->email,
        ]]);
    }
}
