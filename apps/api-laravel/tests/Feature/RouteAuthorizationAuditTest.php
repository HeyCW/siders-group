<?php

namespace Tests\Feature;

use Illuminate\Support\Facades\Route;
use Tests\TestCase;

/**
 * Node's Express app refused to *boot* if any route lacked an explicit guard declaration
 * ("silence is a denial, not a grant" — see auditAuthorizationDeclarations). Laravel's route
 * table isn't introspectable that early/cleanly (multiple route files, package-registered
 * routes), so this becomes a CI gate instead: every API route must carry one of
 * `auth:staff`, `auth:reader`, `permission:*`, or the explicit `public` marker middleware.
 * An undeclared route fails the build, not the boot.
 */
class RouteAuthorizationAuditTest extends TestCase
{
    public function test_every_api_route_declares_an_authorization_decision(): void
    {
        $undeclared = collect(Route::getRoutes())
            ->filter(fn ($route) => str_starts_with($route->uri(), 'api/'))
            ->reject(function ($route) {
                $middleware = $route->gatherMiddleware();

                return collect($middleware)->contains(function ($m) {
                    return $m === 'public'
                        || str_starts_with($m, 'auth:staff')
                        || str_starts_with($m, 'auth:reader')
                        || str_starts_with($m, 'permission:');
                });
            })
            ->map(fn ($route) => implode('|', $route->methods()).' '.$route->uri())
            ->values();

        $this->assertEmpty(
            $undeclared,
            "The following API routes declare no auth/permission/public middleware:\n".$undeclared->implode("\n"),
        );
    }
}
