<?php

declare(strict_types=1);

namespace App\Services;

use App\Models\Role;
use Illuminate\Support\Facades\Cache;

/**
 * Resolves the immutable seeded Owner role — recognized only by `is_system = true`, never by
 * name/slug, so renaming a role can never accidentally grant/revoke Owner status. Cached with
 * `rememberForever` (not a static property) since PHP-FPM has no persistent process memory
 * between requests, unlike the Node app's module-scope cache.
 */
class OwnerRoleResolver
{
    private const CACHE_KEY = 'rbac.owner_role_id';

    /**
     * @throws \RuntimeException if zero or more than one system role exists — an ambiguous Owner
     *                            role is a data-integrity bug, not a recoverable state.
     */
    public function id(): string
    {
        return Cache::rememberForever(self::CACHE_KEY, function (): string {
            return Role::where('is_system', true)->sole()->id;
        });
    }

    public function isOwner(string $roleId): bool
    {
        return $roleId === $this->id();
    }

    public function forget(): void
    {
        Cache::forget(self::CACHE_KEY);
    }
}
