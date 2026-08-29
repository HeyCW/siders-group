<?php

namespace App\Providers;

use App\Services\Contracts\DeployNotifierInterface;
use App\Services\DeployNotifier;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        $this->app->bind(DeployNotifierInterface::class, DeployNotifier::class);
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        //
    }
}
