<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use App\Exceptions\PasswordChangeRequiredException;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Symfony\Component\HttpFoundation\Response;

/**
 * Blocks every staff route except the password-change endpoint itself while
 * `must_change_password` is set — applied per-route, not globally, so the one endpoint that must
 * stay reachable (staff.me.password) simply never gets this middleware attached.
 */
class EnsurePasswordChangeNotPending
{
    public function handle(Request $request, Closure $next): Response
    {
        $staff = Auth::guard('staff')->user();

        if ($staff !== null && $staff->must_change_password) {
            throw new PasswordChangeRequiredException();
        }

        return $next($request);
    }
}
