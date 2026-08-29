<?php

use App\Exceptions\DomainException;
use App\Http\Middleware\EnsurePasswordChangeNotPending;
use App\Http\Middleware\EnsurePermission;
use App\Http\Middleware\EnsureReaderCanAuthorContent;
use App\Http\Middleware\EnsureStaffActive;
use App\Http\Middleware\MarkPublicRoute;
use Illuminate\Auth\AuthenticationException;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;
use Illuminate\Session\TokenMismatchException;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->statefulApi();

        $middleware->alias([
            'public' => MarkPublicRoute::class,
            'staff.active' => EnsureStaffActive::class,
            'staff.password_change_not_pending' => EnsurePasswordChangeNotPending::class,
            'permission' => EnsurePermission::class,
            'reader.can_author_content' => EnsureReaderCanAuthorContent::class,
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->shouldRenderJsonWhen(
            fn (Request $request) => $request->is('api/*') || $request->expectsJson(),
        );

        $exceptions->render(function (DomainException $e, Request $request) {
            return response()->json([
                'error' => ['code' => $e->getErrorCode(), 'message' => $e->getMessage()],
            ], $e->getStatus());
        });

        // Gives the frontend's recovery logic a stable `code` to key on — Laravel's own default
        // renders for these two carry no such field.
        $exceptions->render(function (AuthenticationException $e, Request $request) {
            return response()->json([
                'error' => ['code' => 'unauthenticated', 'message' => 'Authentication is required.'],
            ], 401);
        });

        $exceptions->render(function (TokenMismatchException $e, Request $request) {
            return response()->json([
                'error' => ['code' => 'csrf_failed', 'message' => 'CSRF token mismatch.'],
            ], 419);
        });
    })->create();
