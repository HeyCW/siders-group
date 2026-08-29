<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use App\Exceptions\InsufficientPermissionException;
use App\Services\OwnerRoleResolver;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Symfony\Component\HttpFoundation\Response;

/**
 * `permission:news.manage` or `permission:user.manage,role.manage` (comma-separated = OR, any one
 * suffices) — replaces the Node app's requirePermission/requireAnyPermission. The seeded Owner
 * role always passes, recognized only via OwnerRoleResolver (immutable seeded row id), never by
 * name — granting/touching Owner-only actions is enforced separately at the service layer
 * (Phase 4), not here.
 */
class EnsurePermission
{
    public function __construct(private readonly OwnerRoleResolver $ownerRoleResolver) {}

    public function handle(Request $request, Closure $next, string ...$permissionKeys): Response
    {
        $staff = Auth::guard('staff')->user();

        if ($staff === null) {
            throw new InsufficientPermissionException();
        }

        if ($this->ownerRoleResolver->isOwner($staff->role_id)) {
            return $next($request);
        }

        $granted = $staff->role->permissions()->whereIn('key', $permissionKeys)->exists();

        if (! $granted) {
            throw new InsufficientPermissionException();
        }

        return $next($request);
    }
}
