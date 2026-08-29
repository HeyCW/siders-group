<?php

declare(strict_types=1);

namespace App\Services;

use App\Models\User;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Hash;

class StaffAuthService
{
    /**
     * Verifies credentials without ever branching observably on *why* they failed (unknown
     * email vs wrong password vs disabled account all take the same path here) — mirrors the
     * Node app's constant-cost dummy-hash comparison so a timing/response difference can't be
     * used to enumerate valid staff emails.
     */
    public function attempt(string $email, string $password): ?User
    {
        $user = User::where('email', $email)->first();

        $hash = $user?->password_hash ?? $this->dummyHash();
        $verified = Hash::check($password, $hash);

        if (! $verified || $user === null || ! $user->isActive()) {
            return null;
        }

        $user->forceFill(['last_login_at' => now()])->save();

        return $user;
    }

    /**
     * Cached (not regenerated per request) so an unknown-email attempt costs one Hash::check,
     * the same as a known-email wrong-password attempt — not an extra Hash::make on top.
     */
    private function dummyHash(): string
    {
        return Cache::rememberForever(
            'auth.staff_dummy_hash',
            fn () => Hash::make((string) \Illuminate\Support\Str::random(32)),
        );
    }
}
