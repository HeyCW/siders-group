<?php

use App\Models\Reader;
use App\Models\User;

return [

    /*
    |--------------------------------------------------------------------------
    | Authentication Defaults
    |--------------------------------------------------------------------------
    |
    | Two disjoint subject types exist — staff (RBAC-permissioned admin
    | accounts) and reader (Google-OAuth-only public accounts) — kept as
    | separate guards/providers rather than one shared guard, since the two
    | route namespaces (admin vs public) never overlap and this avoids an
    | ambiguous `$request->user()` whose concrete class callers must branch on.
    |
    */

    'defaults' => [
        'guard' => env('AUTH_GUARD', 'staff'),
        'passwords' => null,
    ],

    /*
    |--------------------------------------------------------------------------
    | Authentication Guards
    |--------------------------------------------------------------------------
    */

    'guards' => [
        'staff' => [
            'driver' => 'session',
            'provider' => 'staff',
        ],

        'reader' => [
            'driver' => 'session',
            'provider' => 'readers',
        ],
    ],

    /*
    |--------------------------------------------------------------------------
    | User Providers
    |--------------------------------------------------------------------------
    */

    'providers' => [
        'staff' => [
            'driver' => 'eloquent',
            'model' => env('AUTH_STAFF_MODEL', User::class),
        ],

        'readers' => [
            'driver' => 'eloquent',
            'model' => env('AUTH_READER_MODEL', Reader::class),
        ],
    ],

    /*
    |--------------------------------------------------------------------------
    | Resetting Passwords
    |--------------------------------------------------------------------------
    |
    | Not used — staff password reset is a forced-temporary-password flow
    | (StaffAccountService), not Laravel's email-token broker, so there is no
    | password_reset_tokens table in this schema.
    |
    */

    'passwords' => [],

    /*
    |--------------------------------------------------------------------------
    | Password Confirmation Timeout
    |--------------------------------------------------------------------------
    */

    'password_timeout' => env('AUTH_PASSWORD_TIMEOUT', 10800),

];
