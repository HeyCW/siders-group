<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Cross-Origin Resource Sharing (CORS) Configuration
    |--------------------------------------------------------------------------
    |
    | Sanctum SPA auth needs real credentialed CORS (cookies + X-XSRF-TOKEN),
    | which is incompatible with a wildcard origin — the two allowed origins
    | are apps/web and apps/admin, dev ports by default, overridable in prod.
    |
    */

    'paths' => ['api/*', 'sanctum/csrf-cookie'],

    'allowed_methods' => ['*'],

    'allowed_origins' => array_filter(explode(',', env(
        'CORS_ALLOWED_ORIGINS',
        'http://localhost:3000,http://localhost:5173',
    ))),

    'allowed_origins_patterns' => [],

    'allowed_headers' => ['*'],

    'exposed_headers' => [],

    'max_age' => 0,

    'supports_credentials' => true,

];
