<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use App\Exceptions\AccountDisabledException;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Symfony\Component\HttpFoundation\Response;

/**
 * Stacked after `auth:staff` on every staff-facing route: a disabled account keeps its session
 * cookie valid at the framework level, so this is the actual "still allowed to act" gate.
 */
class EnsureStaffActive
{
    public function handle(Request $request, Closure $next): Response
    {
        $staff = Auth::guard('staff')->user();

        if ($staff !== null && ! $staff->isActive()) {
            throw new AccountDisabledException();
        }

        return $next($request);
    }
}
