<?php

declare(strict_types=1);

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Services\ReaderAuthService;
use App\Services\SessionRevocationService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Laravel\Socialite\Facades\Socialite;

class GoogleAuthController extends Controller
{
    private const SESSION_NEXT_KEY = 'oauth_next';

    public function __construct(
        private readonly ReaderAuthService $readerAuthService,
        private readonly SessionRevocationService $sessionRevocationService,
    ) {}

    /**
     * This is a full-page browser navigation (the reader is sent to Google's own login page),
     * never an XHR/fetch call — so `next` (where to land the reader back in the SPA afterwards)
     * has to survive round-tripping through Google via our own session, and the eventual
     * response from `callback()` below has to be an HTTP redirect, not JSON.
     */
    public function redirect(Request $request): RedirectResponse
    {
        $request->session()->put(self::SESSION_NEXT_KEY, $this->resolveNextUrl($request->query('next')));

        return Socialite::driver('google')
            ->scopes(['openid', 'email', 'profile'])
            ->redirect();
    }

    public function callback(Request $request): RedirectResponse
    {
        $next = $request->session()->pull(self::SESSION_NEXT_KEY, $this->defaultFrontendOrigin());

        $googleUser = Socialite::driver('google')->user();

        $reader = $this->readerAuthService->findOrCreateFromGoogle($googleUser);

        Auth::guard('reader')->login($reader);
        $request->session()->regenerate();
        $this->sessionRevocationService->bindCurrentSession($request, $reader->id);

        return redirect()->away($next);
    }

    /**
     * `next` must land the reader back on an allowed frontend origin — never another origin
     * (open-redirect guard). Falls back to that origin's root when absent or invalid, rather than
     * rejecting the sign-in outright.
     */
    private function resolveNextUrl(?string $next): string
    {
        if ($next !== null && $this->isAllowedNext($next)) {
            return $next;
        }

        return $this->defaultFrontendOrigin();
    }

    private function isAllowedNext(string $next): bool
    {
        foreach (config('cors.allowed_origins', []) as $origin) {
            if (str_starts_with($next, $origin.'/') || $next === $origin) {
                return true;
            }
        }

        return false;
    }

    private function defaultFrontendOrigin(): string
    {
        return config('cors.allowed_origins')[0] ?? '/';
    }
}
