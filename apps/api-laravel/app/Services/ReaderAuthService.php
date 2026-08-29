<?php

declare(strict_types=1);

namespace App\Services;

use App\Models\Reader;
use Laravel\Socialite\Contracts\User as SocialiteUser;

class ReaderAuthService
{
    /**
     * Upserts strictly on `google_sub`, never on email — matches the Node app's account-linking
     * rule (a changed/shared email must never merge two Google identities together).
     */
    public function findOrCreateFromGoogle(SocialiteUser $googleUser): Reader
    {
        $reader = Reader::firstOrNew(['google_sub' => $googleUser->getId()]);

        $reader->fill([
            'email' => $googleUser->getEmail(),
            'email_verified' => (bool) ($googleUser->user['email_verified'] ?? false),
            'name' => $googleUser->getName() ?? $googleUser->getNickname() ?? $googleUser->getEmail(),
            'avatar_url' => $googleUser->getAvatar(),
            'last_login_at' => now(),
        ]);

        $reader->save();

        return $reader;
    }
}
