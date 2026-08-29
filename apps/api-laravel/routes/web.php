<?php

use App\Http\Controllers\Auth\GoogleAuthController;
use Illuminate\Support\Facades\Route;

Route::get('/', function () {
    return view('welcome');
});

/**
 * Deliberately in routes/web.php, not routes/api.php: this is a full-page browser navigation
 * (the reader is sent to Google's own login page and back), never an XHR/fetch call. Sanctum's
 * `EnsureFrontendRequestsAreStateful` (applied to routes/api.php via statefulApi()) only starts a
 * session when the request's Referer/Origin matches an allowed frontend domain — but the
 * callback leg arrives with a Referer of accounts.google.com (or none at all), so it would never
 * be recognized as stateful and `$request->session()` would throw. The 'web' middleware group
 * here starts a session unconditionally, regardless of Referer.
 */
Route::prefix('auth/google')->middleware('public')->group(function () {
    Route::get('/redirect', [GoogleAuthController::class, 'redirect']);
    Route::get('/callback', [GoogleAuthController::class, 'callback'])->middleware('throttle:google-callback');
});
