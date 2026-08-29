<?php

namespace App\Providers;

use App\Models\Comment;
use App\Models\Reader;
use App\Services\Contracts\DeployNotifierInterface;
use App\Services\DeployNotifier;
use Illuminate\Database\Eloquent\Relations\Relation;
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
        // Matches moderation_actions.target_type's DB enum values exactly.
        Relation::enforceMorphMap([
            'comment' => Comment::class,
            'reader' => Reader::class,
        ]);
    }
}
