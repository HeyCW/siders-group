<?php

declare(strict_types=1);

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Services\ReaderAuthService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Support\Facades\Auth;
use Laravel\Socialite\Facades\Socialite;

class GoogleAuthController extends Controller
{
    public function __construct(private readonly ReaderAuthService $readerAuthService) {}

    public function redirect(): RedirectResponse
    {
        return Socialite::driver('google')
            ->scopes(['openid', 'email', 'profile'])
            ->redirect();
    }

    public function callback(): JsonResponse
    {
        $googleUser = Socialite::driver('google')->user();

        $reader = $this->readerAuthService->findOrCreateFromGoogle($googleUser);

        Auth::guard('reader')->login($reader);

        return response()->json(['data' => [
            'id' => $reader->id,
            'name' => $reader->name,
            'email' => $reader->email,
        ]]);
    }
}
