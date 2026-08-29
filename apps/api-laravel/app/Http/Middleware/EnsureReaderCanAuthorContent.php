<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use App\Exceptions\ReaderBannedException;
use App\Exceptions\ReaderMutedException;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Symfony\Component\HttpFoundation\Response;

/**
 * Applied only to content-creating reader actions (comments) — likes and reports deliberately
 * skip this (a muted/banned reader may still like or report, per the Node app's
 * `createsContent:false` distinction).
 */
class EnsureReaderCanAuthorContent
{
    public function handle(Request $request, Closure $next): Response
    {
        $reader = Auth::guard('reader')->user();

        if ($reader !== null) {
            if ($reader->isBanned()) {
                throw new ReaderBannedException();
            }

            if ($reader->isMuted()) {
                throw new ReaderMutedException();
            }
        }

        return $next($request);
    }
}
