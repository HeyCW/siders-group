<?php

namespace App\Providers;

use App\Models\Comment;
use App\Models\Reader;
use App\Services\Contracts\DeployNotifierInterface;
use App\Services\DeployNotifier;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Database\Eloquent\Relations\Relation;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
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

        $this->registerRateLimiters();
    }

    /**
     * Laravel's built-in throttle middleware, replacing the Node app's custom in-memory
     * anti-enumeration limiter — standard 429 responses are acceptable now (that decision was
     * confirmed with the user), so there's no need to disguise a throttled response as an
     * ordinary failure.
     */
    private function registerRateLimiters(): void
    {
        RateLimiter::for('staff-login', fn (Request $request) => [
            Limit::perMinutes(15, 30)->by('staff-login-ip:'.$request->ip()),
            Limit::perMinutes(15, 5)->by('staff-login-email:'.$request->ip().'|'.mb_strtolower((string) $request->input('email'))),
        ]);

        RateLimiter::for('google-callback', fn (Request $request) => Limit::perMinutes(15, 20)->by($request->ip()));

        RateLimiter::for('password-change', fn (Request $request) => Limit::perMinutes(15, 10)->by((string) $request->user('staff')?->id));

        RateLimiter::for('media-upload', fn (Request $request) => Limit::perMinutes(15, 30)->by((string) $request->user('staff')?->id));

        RateLimiter::for('engagement-view', fn (Request $request) => Limit::perHour(60)->by($request->ip()));

        RateLimiter::for('engagement-like', fn (Request $request) => Limit::perHour(60)->by((string) $request->user('reader')?->id));

        RateLimiter::for('engagement-comment', fn (Request $request) => Limit::perHour(10)->by((string) $request->user('reader')?->id));

        RateLimiter::for('comment-report', fn (Request $request) => Limit::perHour(20)->by((string) $request->user('reader')?->id));

        RateLimiter::for('contact-submit', fn (Request $request) => Limit::perHour(3)->by($request->ip()));
    }
}
