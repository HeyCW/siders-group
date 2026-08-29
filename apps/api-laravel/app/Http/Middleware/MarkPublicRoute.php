<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * No-op passthrough. Its only purpose is to mark a route as *explicitly* public — "silence is a
 * denial, not a grant" (see the Node app's auditAuthorizationDeclarations) — so the route
 * authorization audit test (Phase 15/16) can tell "deliberately public" apart from "forgot to
 * declare a guard" for every registered route.
 */
class MarkPublicRoute
{
    public function handle(Request $request, Closure $next): Response
    {
        return $next($request);
    }
}
